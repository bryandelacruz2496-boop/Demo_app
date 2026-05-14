const express = require('express');
const webpush = require('web-push');
const router = express.Router();

// Set VAPID keys (generate once and store in env)
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkGs-GDq6QAKkFhXCW0ePI_o02nlHjS6GkF7Vy1Me8';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'UUxI4o8-FbRouAevSmBQ736P-p7Mvxf1WRE9UWJGt00';

webpush.setVapidDetails('mailto:admin@beatasai.edu.ph', VAPID_PUBLIC, VAPID_PRIVATE);

// Store subscriptions in memory (in production use DB)
let subscriptions = [];

// GET /api/push/vapid-public - Get public key
router.get('/vapid-public', (req, res) => {
    res.json({ key: VAPID_PUBLIC });
});

// POST /api/push/subscribe - Subscribe to push
router.post('/subscribe', (req, res) => {
    const subscription = req.body;
    if (!subscriptions.find(s => s.endpoint === subscription.endpoint)) {
        subscriptions.push(subscription);
    }
    res.status(201).json({ message: 'Subscribed' });
});

// POST /api/push/send - Send push notification (admin only)
router.post('/send', async (req, res) => {
    const { title, body } = req.body;
    const payload = JSON.stringify({ title, body });
    const results = await Promise.allSettled(
        subscriptions.map(sub => webpush.sendNotification(sub, payload).catch(() => {
            subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
        }))
    );
    res.json({ sent: results.length });
});

const sendPushToAll = async (title, body) => {
    const payload = JSON.stringify({ title, body });
    await Promise.allSettled(subscriptions.map(sub => webpush.sendNotification(sub, payload).catch(() => {
        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
    })));
};

module.exports = { router, sendPushToAll };
