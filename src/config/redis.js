const mongoose = require('mongoose');

const cacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  expireAt: { type: Date, required: true }
});

cacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

let Cache;
try {
  Cache = mongoose.model('Cache');
} catch (e) {
  Cache = mongoose.model('Cache', cacheSchema);
}

const rSet = async (key, val, ttl = 3600) => {
  try {
    const expireAt = new Date(Date.now() + ttl * 1000);
    await Cache.findOneAndUpdate(
      { key },
      { value: val, expireAt },
      { upsert: true, new: true }
    );
  } catch (_) {}
};

const rGet = async (key) => {
  try {
    const doc = await Cache.findOne({ key });
    if (!doc) return null;
    if (doc.expireAt < new Date()) {
      await Cache.deleteOne({ key });
      return null;
    }
    return doc.value;
  } catch (_) {
    return null;
  }
};

const rDel = async (key) => {
  try {
    await Cache.deleteOne({ key });
  } catch (_) {}
};

module.exports = { rSet, rGet, rDel };
