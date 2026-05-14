// Simple in-memory cache
const cache = new Map();

function getCache(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
    }
    return item.data;
}

function setCache(key, data, ttlSeconds = 60) {
    cache.set(key, {
        data,
        expiry: Date.now() + (ttlSeconds * 1000)
    });
}

function clearCache(pattern) {
    if (pattern) {
        for (const key of cache.keys()) {
            if (key.includes(pattern)) {
                cache.delete(key);
            }
        }
    } else {
        cache.clear();
    }
}

module.exports = { getCache, setCache, clearCache };
