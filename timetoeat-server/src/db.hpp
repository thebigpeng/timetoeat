#pragma once
#include <mysql.h>
#include <nlohmann/json.hpp>
#include <cstdlib>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

inline std::string env(const char *key, const char *fallback = "") {
    const auto value = std::getenv(key);
    return value ? value : fallback;
}

// shortcut: 本地联调每请求独立连接；并发规模增长时改为连接池。
// 所有外部参数均通过 MySQL prepared statement 绑定。
class Db {
    MYSQL *connection_ = nullptr;
public:
    Db() {
        connection_ = mysql_init(nullptr);
        if (!connection_) throw std::runtime_error("mysql_init failed");
        unsigned int timeout = 5;
        mysql_options(connection_, MYSQL_OPT_CONNECT_TIMEOUT, &timeout);
        mysql_options(connection_, MYSQL_OPT_READ_TIMEOUT, &timeout);
        mysql_options(connection_, MYSQL_OPT_WRITE_TIMEOUT, &timeout);
        mysql_options(connection_, MYSQL_SET_CHARSET_NAME, "utf8mb4");
        if (!mysql_real_connect(connection_, env("DB_HOST", "127.0.0.1").c_str(),
                env("DB_USER", "timetoeat").c_str(), env("DB_PASSWORD").c_str(),
                env("DB_NAME", "timetoeat").c_str(), std::stoul(env("DB_PORT", "3307")), nullptr, 0)) {
            auto message = std::string(mysql_error(connection_));
            mysql_close(connection_);
            connection_ = nullptr;
            throw std::runtime_error(message);
        }
        query("SET time_zone = '+00:00'");
    }
    Db(const Db&) = delete;
    Db& operator=(const Db&) = delete;
    ~Db() { if (connection_) mysql_close(connection_); }
    void begin() { if (mysql_autocommit(connection_, 0)) throw std::runtime_error(mysql_error(connection_)); }
    void commit() { if (mysql_commit(connection_)) throw std::runtime_error(mysql_error(connection_)); }
    void rollback() { mysql_rollback(connection_); }

    nlohmann::json query(const std::string &sql, const std::vector<std::string> &params = {}) {
        auto stmt = std::unique_ptr<MYSQL_STMT, decltype(&mysql_stmt_close)>(mysql_stmt_init(connection_), mysql_stmt_close);
        if (!stmt) throw std::runtime_error("mysql_stmt_init failed");
        auto check = [&](int error) {
            if (error) throw std::runtime_error(mysql_stmt_error(stmt.get()));
        };
        check(mysql_stmt_prepare(stmt.get(), sql.data(), sql.size()));
        if (mysql_stmt_param_count(stmt.get()) != params.size()) throw std::logic_error("SQL parameter count");
        std::vector<MYSQL_BIND> bindings(params.size());
        std::vector<unsigned long> lengths(params.size());
        for (size_t i = 0; i < params.size(); ++i) {
            lengths[i] = params[i].size();
            bindings[i].buffer_type = MYSQL_TYPE_STRING;
            bindings[i].buffer = const_cast<char*>(params[i].data());
            bindings[i].buffer_length = lengths[i];
            bindings[i].length = &lengths[i];
        }
        if (!params.empty()) check(mysql_stmt_bind_param(stmt.get(), bindings.data()));
        check(mysql_stmt_execute(stmt.get()));
        auto result = nlohmann::json::array();
        auto meta = std::unique_ptr<MYSQL_RES, decltype(&mysql_free_result)>(mysql_stmt_result_metadata(stmt.get()), mysql_free_result);
        if (!meta) return result;
        check(mysql_stmt_store_result(stmt.get()));
        auto count = mysql_num_fields(meta.get());
        auto fields = mysql_fetch_fields(meta.get());
        std::vector<MYSQL_BIND> outputs(count);
        std::vector<std::vector<char>> buffers(count, std::vector<char>(16384));
        std::vector<unsigned long> sizes(count);
        auto nulls = std::make_unique<my_bool[]>(count);
        for (unsigned int i = 0; i < count; ++i) {
            outputs[i].buffer_type = MYSQL_TYPE_STRING;
            outputs[i].buffer = buffers[i].data();
            outputs[i].buffer_length = buffers[i].size();
            outputs[i].length = &sizes[i];
            outputs[i].is_null = &nulls[i];
        }
        check(mysql_stmt_bind_result(stmt.get(), outputs.data()));
        while (true) {
            int status = mysql_stmt_fetch(stmt.get());
            if (status == MYSQL_NO_DATA) break;
            if (status != 0) throw std::runtime_error("SQL result failed or exceeded field limit");
            nlohmann::json row = nlohmann::json::object();
            for (unsigned int i = 0; i < count; ++i) {
                if (nulls[i]) row[fields[i].name] = nullptr;
                else row[fields[i].name] = std::string(buffers[i].data(), sizes[i]);
            }
            result.push_back(row);
        }
        return result;
    }
};

class Transaction {
    Db &db_;
    bool committed_ = false;
public:
    explicit Transaction(Db &db) : db_(db) { db_.begin(); }
    void commit() { db_.commit(); committed_ = true; }
    ~Transaction() { if (!committed_) db_.rollback(); }
};
