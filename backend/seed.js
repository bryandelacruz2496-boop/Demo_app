const mongoose = require('mongoose');
require('dotenv').config();
const Admin = require('./models/Admin');

async function seed() {
    await mongoose.connect(process.env.MONGO_URI);

    const existing = await Admin.findOne({ username: 'admin' });
    if (existing) {
        console.log('Admin user already exists');
        process.exit(0);
    }

    const admin = new Admin({
        username: 'admin',
        password: 'admin123',
        name: 'School Administrator'
    });

    await admin.save();
    console.log('Admin user created: admin / admin123');
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
