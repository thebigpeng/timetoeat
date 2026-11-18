const categories = [
  { id: 'staple', name: '招牌饭', icon: '🍚' },
  { id: 'noodle', name: '面食', icon: '🍜' },
  { id: 'snack', name: '小吃', icon: '🍢' },
  { id: 'soup', name: '汤品', icon: '🍲' },
  { id: 'drink', name: '饮品', icon: '🥤' }
]

const categoryBackground = {
  staple: 'linear-gradient(135deg, #FFF0DC, #FFE0BD)',
  noodle: 'linear-gradient(135deg, #FFE8E0, #FFD1C0)',
  snack: 'linear-gradient(135deg, #FFF3D6, #FFE3A3)',
  soup: 'linear-gradient(135deg, #E6F5EA, #CDEBD6)',
  drink: 'linear-gradient(135deg, #E8F1FF, #CFE2FF)'
}

const dishes = [
  { id: 'd01', name: '招牌牛肉面', desc: '慢炖牛腩 · 手工拉面 · 香菜', emoji: '🍜', price: 38, categoryId: 'noodle', tag: '招牌', sales: 326, rating: 4.9, recommend: true },
  { id: 'd02', name: '秘制红烧肉饭', desc: '肥瘦相间 · 浓油赤酱 · 配时蔬', emoji: '🍚', price: 42, categoryId: 'staple', tag: '热卖', sales: 281, rating: 4.8, recommend: true },
  { id: 'd03', name: '香辣鸡腿饭', desc: '香脆鸡腿 · 秘制辣酱 · 米饭', emoji: '🍗', price: 32, categoryId: 'staple', tag: '', sales: 198, rating: 4.7, recommend: false },
  { id: 'd04', name: '番茄鸡蛋面', desc: '酸甜番茄 · 嫩滑鸡蛋 · 清汤', emoji: '🍅', price: 26, categoryId: 'noodle', tag: '', sales: 175, rating: 4.6, recommend: false },
  { id: 'd05', name: '鲜虾云吞面', desc: '整颗鲜虾 · 薄皮云吞 · 骨汤', emoji: '🥟', price: 34, categoryId: 'noodle', tag: '推荐', sales: 210, rating: 4.8, recommend: true },
  { id: 'd06', name: '糖醋排骨', desc: '外酥里嫩 · 酸甜开胃', emoji: '🍖', price: 46, categoryId: 'staple', tag: '', sales: 132, rating: 4.7, recommend: false },
  { id: 'd07', name: '宫保鸡丁饭', desc: '花生香脆 · 微辣下饭', emoji: '🥜', price: 36, categoryId: 'staple', tag: '', sales: 154, rating: 4.6, recommend: false },
  { id: 'd08', name: '麻婆豆腐饭', desc: '麻辣鲜香 · 嫩豆腐 · 米饭', emoji: '🌶️', price: 28, categoryId: 'staple', tag: '', sales: 143, rating: 4.5, recommend: false },
  { id: 'd09', name: '黄金炸鸡翅', desc: '外酥里嫩 · 现炸出锅', emoji: '🍗', price: 22, categoryId: 'snack', tag: '人气', sales: 267, rating: 4.8, recommend: true },
  { id: 'd10', name: '香脆薯条', desc: '现切土豆 · 配番茄酱', emoji: '🍟', price: 16, categoryId: 'snack', tag: '', sales: 189, rating: 4.5, recommend: false },
  { id: 'd11', name: '手工煎饺', desc: '皮薄馅足 · 底部焦脆', emoji: '🥟', price: 18, categoryId: 'snack', tag: '', sales: 121, rating: 4.6, recommend: false },
  { id: 'd12', name: '凉拌黄瓜', desc: '清爽解腻 · 蒜香十足', emoji: '🥒', price: 12, categoryId: 'snack', tag: '', sales: 98, rating: 4.4, recommend: false },
  { id: 'd13', name: '紫菜蛋花汤', desc: '清淡鲜美 · 佐餐必备', emoji: '🍲', price: 15, categoryId: 'soup', tag: '', sales: 110, rating: 4.5, recommend: false },
  { id: 'd14', name: '酸辣汤', desc: '酸辣开胃 · 料足味浓', emoji: '🥣', price: 16, categoryId: 'soup', tag: '', sales: 86, rating: 4.5, recommend: false },
  { id: 'd15', name: '手打柠檬茶', desc: '鲜柠檬 · 清爽解腻', emoji: '🍋', price: 18, categoryId: 'drink', tag: '解腻', sales: 243, rating: 4.8, recommend: true },
  { id: 'd16', name: '丝滑奶茶', desc: '浓香茶底 · 奶香顺滑', emoji: '🧋', price: 20, categoryId: 'drink', tag: '', sales: 176, rating: 4.7, recommend: false },
  { id: 'd17', name: '现磨豆浆', desc: '醇香原味 · 早晚餐皆宜', emoji: '🥛', price: 10, categoryId: 'drink', tag: '', sales: 134, rating: 4.6, recommend: false },
  { id: 'd18', name: '冰镇可乐', desc: '冰爽气泡 · 畅快搭配', emoji: '🥤', price: 8, categoryId: 'drink', tag: '', sales: 205, rating: 4.7, recommend: false }
]

function formatPrice(value) {
  return Number(value || 0).toFixed(2)
}

function getDish(id) {
  return dishes.find((dish) => dish.id === id) || null
}

function decorate(list, cart) {
  const quantityMap = {}
  ;(cart || []).forEach((item) => {
    quantityMap[item.id] = item.quantity
  })
  return list.map((dish) => {
    return Object.assign({}, dish, {
      quantity: quantityMap[dish.id] || 0,
      priceText: formatPrice(dish.price),
      bg: categoryBackground[dish.categoryId] || '#F2F3F5'
    })
  })
}

function getDecoratedDishes(cart) {
  return decorate(dishes, cart)
}

function getRecommended(cart) {
  return decorate(dishes.filter((dish) => dish.recommend), cart)
}

function getByCategory(categoryId, cart) {
  return decorate(dishes.filter((dish) => dish.categoryId === categoryId), cart)
}

function getDishesByIds(ids, cart) {
  const idList = Array.isArray(ids) ? ids : []
  return decorate(
    idList.map((id) => getDish(id)).filter((dish) => !!dish),
    cart
  )
}

function search(keyword, cart) {
  const key = String(keyword || '').trim().toLowerCase()
  if (!key) return []
  const matched = dishes.filter((dish) => {
    return (
      dish.name.toLowerCase().indexOf(key) !== -1 ||
      dish.desc.toLowerCase().indexOf(key) !== -1 ||
      dish.tag.toLowerCase().indexOf(key) !== -1
    )
  })
  return decorate(matched, cart)
}

module.exports = {
  categories,
  dishes,
  categoryBackground,
  formatPrice,
  getDish,
  decorate,
  getDecoratedDishes,
  getRecommended,
  getByCategory,
  getDishesByIds,
  search
}
