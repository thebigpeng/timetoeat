#include "db.hpp"
#include <httplib.h>
#include <curl/curl.h>
#include <openssl/rand.h>
#include <openssl/sha.h>
#include <algorithm>
#include <iostream>
#include <regex>

using json = nlohmann::json;
using Request = httplib::Request;
using Response = httplib::Response;
struct ApiError : std::runtime_error {
    int status;
    ApiError(int code, const std::string &text) : std::runtime_error(text), status(code) {}
};
std::string hex(const unsigned char *data, size_t size) {
    const char *digits = "0123456789abcdef";
    std::string out;
    for (size_t i = 0; i < size; ++i) { out += digits[data[i] >> 4]; out += digits[data[i] & 15]; }
    return out;
}
std::string randomId() {
    unsigned char bytes[32];
    if (RAND_bytes(bytes, sizeof(bytes)) != 1) throw std::runtime_error("random generator failed");
    return hex(bytes, sizeof(bytes));
}
std::string hash(const std::string &text) {
    unsigned char bytes[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(text.data()), text.size(), bytes);
    return hex(bytes, sizeof(bytes));
}
std::string field(const json &body, const char *key, size_t max, bool required = true) {
    if (!body.contains(key)) {
        if (required) throw ApiError(400, std::string("缺少字段：") + key);
        return "";
    }
    if (!body[key].is_string()) throw ApiError(400, std::string("字段必须为字符串：") + key);
    auto text = body[key].get<std::string>();
    const auto characters = static_cast<size_t>(std::count_if(text.begin(), text.end(), [](unsigned char c) { return (c & 0xc0) != 0x80; }));
    if (characters > max || text.find('\0') != std::string::npos ||
        (required && text.find_first_not_of(" \t\r\n") == std::string::npos)) throw ApiError(400, std::string("字段长度不正确：") + key);
    return text;
}
void validId(const std::string &id) {
    if (!std::regex_match(id, std::regex("[1-9][0-9]{0,18}"))) throw ApiError(400, "用户 ID 不正确");
}
std::string tokenHash(const Request &req) {
    auto value = req.get_header_value("Authorization");
    if (value.size() != 71 || value.substr(0, 7) != "Bearer ") throw ApiError(401, "请重新登录");
    return hash(value.substr(7));
}
std::string actor(Db &db, const Request &req) {
    auto rows = db.query("SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(3)", {tokenHash(req)});
    if (rows.empty()) throw ApiError(401, "登录已过期，请重新登录");
    return rows[0]["user_id"];
}
json userJson(const json &row) {
    return {{"id", row["id"]}, {"name", row["nickname"]}, {"nickName", row["nickname"]},
            {"emoji", row["emoji"]}, {"signature", row["signature"]}, {"avatarUrl", row["avatar_url"]}};
}
json userById(Db &db, const std::string &id) {
    auto rows = db.query("SELECT id,nickname,emoji,signature,avatar_url FROM users WHERE id=?", {id});
    if (rows.empty()) throw ApiError(404, "用户不存在");
    return userJson(rows[0]);
}
void friendCheck(Db &db, const std::string &me, const std::string &peer) {
    validId(peer);
    if (db.query("SELECT user_low FROM friendships WHERE user_low=LEAST(?,?) AND user_high=GREATEST(?,?)",
        {me, peer, me, peer}).empty()) throw ApiError(403, "请先添加好友");
}
json dishes(Db &db, const std::string &user) {
    auto rows = db.query("SELECT d.* FROM dishes d JOIN user_dishes ud ON ud.dish_id=d.id WHERE ud.user_id=? AND d.deleted_at IS NULL ORDER BY d.created_at,d.id", {user});
    json result = json::array();
    for (auto &r : rows) result.push_back({{"id",r["id"]},{"name",r["name"]},{"desc",r["description"]},
        {"emoji",r["emoji"]},{"categoryId",r["category_id"]},{"price",std::stoi(r["price_cents"].get<std::string>()) / 100.0},
        {"isCustom",!r["owner_id"].is_null()},{"tag","我会做"},{"bg","#FFF0DC"}});
    return result;
}
const std::string messageColumns = "id,sender_id,recipient_id,client_id,type,content,dish_id,dish_name,dish_emoji,CAST(UNIX_TIMESTAMP(created_at)*1000 AS UNSIGNED) AS created_ms,CAST(UNIX_TIMESTAMP(read_at)*1000 AS UNSIGNED) AS read_ms";
json messageJson(const json &r) {
    return {{"id",r["id"]},{"fromUserId",r["sender_id"]},{"toUserId",r["recipient_id"]},
        {"clientId",r["client_id"]},{"type",r["type"]},{"content",r["content"]},
        {"dishId",r["dish_id"]},{"dishName",r["dish_name"]},{"dishEmoji",r["dish_emoji"]},
        {"createdAt",std::stoll(r["created_ms"].get<std::string>())},{"read",!r["read_ms"].is_null()}};
}
size_t receiveCurl(char *data, size_t size, size_t n, void *out) {
    auto &text = *static_cast<std::string*>(out);
    if (text.size() + size*n > 16384) return 0;
    text.append(data, size*n); return size*n;
}
std::string wechatIdentity(const std::string &code) {
    if (env("WX_APPID").empty() || env("WX_APP_SECRET").empty()) throw ApiError(503, "服务端尚未配置微信登录");
    auto curl = std::unique_ptr<CURL, decltype(&curl_easy_cleanup)>(curl_easy_init(), curl_easy_cleanup);
    if (!curl) throw std::runtime_error("curl init failed");
    auto escape = [&](const std::string &s) {
        auto p = std::unique_ptr<char, decltype(&curl_free)>(curl_easy_escape(curl.get(), s.c_str(), s.size()), curl_free);
        if (!p) throw std::runtime_error("curl escape failed");
        return std::string(p.get());
    };
    auto url = "https://api.weixin.qq.com/sns/jscode2session?appid=" + escape(env("WX_APPID")) +
        "&secret=" + escape(env("WX_APP_SECRET")) + "&js_code=" + escape(code) + "&grant_type=authorization_code";
    std::string output;
    curl_easy_setopt(curl.get(), CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl.get(), CURLOPT_TIMEOUT, 10L);
    curl_easy_setopt(curl.get(), CURLOPT_WRITEFUNCTION, receiveCurl);
    curl_easy_setopt(curl.get(), CURLOPT_WRITEDATA, &output);
    if (curl_easy_perform(curl.get()) != CURLE_OK) throw ApiError(502, "微信登录服务暂时不可用");
    long status = 0; curl_easy_getinfo(curl.get(), CURLINFO_RESPONSE_CODE, &status);
    auto value = json::parse(output, nullptr, false);
    if (status != 200 || value.is_discarded() || !value.contains("openid")) throw ApiError(401, "微信登录凭证无效，请重试");
    return "wx:" + field(value, "openid", 100);
}

json login(Db &db, const json &body, bool test) {
    std::string identity;
    if (test) {
        if (env("ALLOW_TEST_LOGIN") != "true") throw ApiError(403, "测试登录未开启");
        auto account = field(body, "account", 64);
        if (!std::regex_match(account, std::regex("[A-Za-z0-9_-]{3,64}"))) throw ApiError(400, "测试账号限 3–64 位字母、数字、下划线或横线");
        identity = "test:" + account;
    } else identity = wechatIdentity(field(body, "code", 256));
    auto name = field(body, "nickName", 64, false);
    if (name.empty()) name = test ? "测试用户" : "微信用户";
    auto avatar = field(body, "avatarUrl", 1024, false);
    if (!avatar.empty() && avatar.rfind("https://", 0) != 0) throw ApiError(400, "头像地址必须为 HTTPS");
    Transaction tx(db);
    db.query("INSERT INTO users(identity_key,login_type,nickname,avatar_url) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE last_login_at=UTC_TIMESTAMP(3)", {identity,test ? "test" : "wechat",name,avatar});
    auto me = db.query("SELECT id FROM users WHERE identity_key=?", {identity})[0]["id"].get<std::string>();
    const auto token = randomId();
    db.query("DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP(3)");
    db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY))", {hash(token),me});
    auto result = userById(db, me);
    result["token"] = token;
    result["loginType"] = test ? "test" : "wechat";
    tx.commit();
    return result;
}

int main() {
    mysql_library_init(0, nullptr, nullptr);
    curl_global_init(CURL_GLOBAL_DEFAULT);
    httplib::Server server;
    server.set_payload_max_length(16384);
    server.set_read_timeout(10, 0);
    server.set_write_timeout(10, 0);
    auto handle = [](auto fn) {
        return [fn](const Request &req, Response &res) {
            res.set_header("Cache-Control", "no-store");
            try {
                Db db;
                auto body = req.body.empty() ? json::object() : json::parse(req.body);
                if (!body.is_object()) throw ApiError(400, "请求必须为 JSON 对象");
                res.set_content(json({{"data",fn(db,req,body)}}).dump(), "application/json; charset=utf-8");
            } catch (const ApiError &e) {
                res.status = e.status; res.set_content(json({{"error",e.what()}}).dump(), "application/json; charset=utf-8");
            } catch (const json::exception &) {
                res.status = 400; res.set_content("{\"error\":\"JSON 格式不正确\"}", "application/json; charset=utf-8");
            } catch (const std::exception &e) {
                std::cerr << "request failed: " << e.what() << '\n';
                res.status = 500; res.set_content("{\"error\":\"服务暂时不可用\"}", "application/json; charset=utf-8");
            }
            mysql_thread_end();
        };
    };
    server.Get("/health", handle([](Db &db,const Request&,const json&) { db.query("SELECT 1 FROM users LIMIT 1"); return json{{"status","ok"}}; }));
    server.Post("/api/auth/test", handle([](Db &db,const Request&,const json &b) { return login(db,b,true); }));
    server.Post("/api/auth/wechat", handle([](Db &db,const Request&,const json &b) { return login(db,b,false); }));
    server.Post("/api/auth/logout", handle([](Db &db,const Request &r,const json&) {
        actor(db,r); db.query("DELETE FROM sessions WHERE token_hash=?", {tokenHash(r)}); return json{{"ok",true}};
    }));
    server.Get("/api/me", handle([](Db &db,const Request &r,const json&) { return userById(db,actor(db,r)); }));
    server.Get("/api/users", handle([](Db &db,const Request &r,const json&) {
        auto me = actor(db,r); auto key = r.get_param_value("q");
        if (key.size()>192) throw ApiError(400,"搜索内容过长");
        auto rows = db.query("SELECT id,nickname,emoji,signature,avatar_url FROM users WHERE id<>? AND (LOCATE(?,nickname)>0 OR id=?) ORDER BY id LIMIT 50", {me,key,key});
        json result=json::array();
        for (auto &u:rows) result.push_back(userJson(u));
        return result;
    }));
    server.Get("/api/friends", handle([](Db &db,const Request &r,const json&) {
        auto me=actor(db,r);
        auto rows=db.query("SELECT u.id,u.nickname,u.emoji,u.signature,u.avatar_url,IF(f.user_low=?,f.remark_by_low,f.remark_by_high) AS remark FROM friendships f JOIN users u ON u.id=IF(f.user_low=?,f.user_high,f.user_low) WHERE f.user_low=? OR f.user_high=? ORDER BY u.id", {me,me,me,me});
        json result=json::array();
        for(auto &u:rows) { auto user=userJson(u); user["remark"]=u["remark"]; result.push_back(user); }
        return result;
    }));
    server.Put(R"(/api/friends/([1-9][0-9]{0,18})/remark)", handle([](Db &db,const Request &r,const json &b) {
        auto me=actor(db,r); std::string peer=r.matches[1];
        if(!b.contains("remark")) throw ApiError(400,"缺少字段：remark");
        auto remark=field(b,"remark",32,false);
        auto begin=remark.find_first_not_of(" \t\r\n");
        remark=begin==std::string::npos ? "" : remark.substr(begin,remark.find_last_not_of(" \t\r\n")-begin+1);
        if(std::any_of(remark.begin(),remark.end(),[](unsigned char c) { return c<32 || c==127; })) throw ApiError(400,"备注不能包含换行或控制字符");
        friendCheck(db,me,peer);
        db.query("UPDATE friendships SET remark_by_low=IF(user_low=?, ?, remark_by_low),remark_by_high=IF(user_high=?, ?, remark_by_high) WHERE user_low=LEAST(?,?) AND user_high=GREATEST(?,?)",{me,remark,me,remark,me,peer,me,peer});
        return json{{"userId",peer},{"remark",remark}};
    }));
    server.Post("/api/friends", handle([](Db &db,const Request &r,const json &b) {
        auto me=actor(db,r), peer=field(b,"userId",19); validId(peer);
        if(me==peer) throw ApiError(400,"不能添加自己");
        auto user=userById(db,peer);
        db.query("INSERT INTO friendships(user_low,user_high) VALUES(LEAST(?,?),GREATEST(?,?)) ON DUPLICATE KEY UPDATE user_low=user_low", {me,peer,me,peer});
        return user;
    }));
    server.Get("/api/dishes", handle([](Db &db,const Request &r,const json&) {
        auto me=actor(db,r), owner=r.get_param_value("userId");
        if(owner.empty()) owner=me;
        validId(owner); userById(db,owner); return dishes(db,owner);
    }));
    server.Get("/api/catalog", handle([](Db &db,const Request &r,const json&) {
        actor(db,r); return db.query("SELECT id,name,description,emoji,category_id,price_cents FROM dishes WHERE owner_id IS NULL AND deleted_at IS NULL ORDER BY id");
    }));
    server.Post("/api/dishes", handle([](Db &db,const Request &r,const json &b) {
        auto me=actor(db,r), name=field(b,"name",100), description=field(b,"desc",500,false), emoji=field(b,"emoji",32,false);
        if(emoji.empty()) emoji="🍲";
        auto id=randomId(); Transaction tx(db);
        db.query("INSERT INTO dishes(id,owner_id,name,description,emoji) VALUES(?,?,?,?,?)", {id,me,name,description,emoji});
        db.query("INSERT INTO user_dishes(user_id,dish_id) VALUES(?,?)", {me,id}); tx.commit();
        return json{{"id",id}};
    }));
    server.Delete(R"(/api/dishes/([A-Za-z0-9_-]{1,64}))", handle([](Db &db,const Request &r,const json&) {
        auto me=actor(db,r); std::string id=r.matches[1]; Transaction tx(db);
        if(db.query("SELECT dish_id FROM user_dishes WHERE user_id=? AND dish_id=? FOR UPDATE",{me,id}).empty()) throw ApiError(404,"菜品不存在或不属于你");
        db.query("DELETE FROM user_dishes WHERE user_id=? AND dish_id=?",{me,id});
        db.query("UPDATE dishes SET deleted_at=UTC_TIMESTAMP(3) WHERE id=? AND owner_id=?",{id,me}); tx.commit(); return json{{"ok",true}};
    }));
    server.Post("/api/dishes/select", handle([](Db &db,const Request &r,const json &b) {
        auto me=actor(db,r), id=field(b,"dishId",64);
        if(db.query("SELECT id FROM dishes WHERE id=? AND owner_id IS NULL AND deleted_at IS NULL",{id}).empty()) throw ApiError(404,"公共菜品不存在");
        db.query("INSERT INTO user_dishes(user_id,dish_id) VALUES(?,?) ON DUPLICATE KEY UPDATE dish_id=dish_id",{me,id}); return json{{"ok",true}};
    }));
    server.Get("/api/messages", handle([](Db &db,const Request &r,const json&) {
        auto me=actor(db,r), peer=r.get_param_value("peer"), before=r.get_param_value("before");
        friendCheck(db,me,peer);
        if(before.empty()) before="18446744073709551615";
        else validId(before);
        auto rows=db.query("SELECT "+messageColumns+" FROM messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND id<? ORDER BY id DESC LIMIT 51",{me,peer,peer,me,before});
        bool more=rows.size()>50; if(more) rows.erase(rows.end()-1);
        json result=json::array(); for(auto it=rows.rbegin();it!=rows.rend();++it) result.push_back(messageJson(*it));
        return json{{"messages",result},{"hasMore",more}};
    }));
    server.Get("/api/conversations", handle([](Db &db,const Request &r,const json&) {
        auto me=actor(db,r);
        auto rows=db.query("SELECT "+messageColumns+" FROM messages WHERE id IN (SELECT MAX(id) FROM messages WHERE sender_id=? OR recipient_id=? GROUP BY IF(sender_id=?,recipient_id,sender_id)) ORDER BY id DESC",{me,me,me});
        auto counts=db.query("SELECT sender_id,COUNT(*) AS n FROM messages WHERE recipient_id=? AND read_at IS NULL GROUP BY sender_id",{me});
        json result=json::array();
        for(auto &row:rows) {
            auto peer=row["sender_id"]==me?row["recipient_id"].get<std::string>():row["sender_id"].get<std::string>();
            int unread=0; for(auto &c:counts) if(c["sender_id"]==peer) unread=std::stoi(c["n"].get<std::string>());
            result.push_back({{"peerId",peer},{"last",messageJson(row)},{"unreadCount",unread}});
        } return result;
    }));
    server.Post("/api/messages", handle([](Db &db,const Request &r,const json &b) {
        auto me=actor(db,r), peer=field(b,"toUserId",19), type=field(b,"type",16), client=field(b,"clientId",64);
        if(!std::regex_match(client,std::regex("[A-Za-z0-9_-]{8,64}"))) throw ApiError(400,"消息请求标识不正确");
        friendCheck(db,me,peer);
        if(type!="text"&&type!="sticker"&&type!="dish"&&type!="nudge") throw ApiError(400,"消息类型不支持");
        auto content=field(b,"content",1000,type=="text"||type=="sticker");
        std::string dishId,dishName,dishEmoji;
        Transaction tx(db);
        auto existing=db.query("SELECT "+messageColumns+" FROM messages WHERE sender_id=? AND client_id=?",{me,client});
        if(!existing.empty()) {
            if(existing[0]["recipient_id"]!=peer || existing[0]["type"]!=type) throw ApiError(409,"消息请求标识已被使用");
            tx.commit(); return messageJson(existing[0]);
        }
        if(type=="dish"||type=="nudge") {
            dishId=field(b,"dishId",64);
            auto rows=db.query("SELECT d.name,d.emoji FROM dishes d JOIN user_dishes ud ON ud.dish_id=d.id WHERE d.id=? AND ud.user_id=? AND d.deleted_at IS NULL FOR UPDATE",{dishId,peer});
            if(rows.empty()) throw ApiError(400,"好友已不再提供这道菜");
            dishName=rows[0]["name"]; dishEmoji=rows[0]["emoji"];
            if(type=="dish") content="我想吃："+dishName;
            else if(content.empty()) content="催一下"+dishName+"～";
        }
        db.query("INSERT INTO messages(sender_id,recipient_id,client_id,type,content,dish_id,dish_name,dish_emoji) VALUES(?,?,?,?,?,NULLIF(?,''),?,?) ON DUPLICATE KEY UPDATE id=id",{me,peer,client,type,content,dishId,dishName,dishEmoji});
        // Current read sees the winning concurrent insert under MySQL REPEATABLE READ.
        auto message=messageJson(db.query("SELECT "+messageColumns+" FROM messages WHERE sender_id=? AND client_id=? FOR UPDATE",{me,client})[0]);
        if(message["toUserId"]!=peer || message["type"]!=type) throw ApiError(409,"消息请求标识已被使用");
        tx.commit(); return message;
    }));
    server.Post("/api/messages/read", handle([](Db &db,const Request &r,const json &b) {
        auto me=actor(db,r), peer=field(b,"peerId",19), through=field(b,"throughId",19); validId(through); friendCheck(db,me,peer);
        db.query("UPDATE messages SET read_at=UTC_TIMESTAMP(3) WHERE recipient_id=? AND sender_id=? AND id<=? AND read_at IS NULL",{me,peer,through}); return json{{"ok",true}};
    }));
    std::cout << "TimeToEat API listening on :8080; test login " << (env("ALLOW_TEST_LOGIN")=="true"?"enabled":"disabled") << std::endl;
    if(!server.listen("0.0.0.0",8080)) return 1;
    curl_global_cleanup(); mysql_library_end();
}
