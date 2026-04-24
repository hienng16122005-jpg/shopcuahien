require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Firebase Admin
let db;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("Server: Firebase Admin Initialized");
    }
} catch (e) {
    console.error("Server: Failed to initialize Firebase Admin:", e.message);
}

// --- FIREBASE SYNC HELPERS ---
async function getFirestoreData(collection) {
    if (!db) return [];
    const snap = await db.collection(collection).get();
    
    // Auto-seed if results are empty (Initial setup)
    if (snap.empty && collection === 'products') {
        console.log("Server: Seeding sample products...");
        const sampleProducts = [
            { name: 'Khăn khô đa năng Likado', price: 45000, category: 'skincare', image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500', stock: 100, description: 'Khăn giấy khô cao cấp' },
            { name: 'Sữa rửa mặt Cetaphil 500ml', price: 380000, category: 'skincare', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=500', stock: 50, description: 'Dịu nhẹ cho mọi loại da' },
            { name: 'Serum The Ordinary Niacinamide', price: 210000, category: 'skincare', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=500', stock: 40, description: 'Kiềm dầu và giảm mụn' },
            { name: 'Tẩy trang Bioderma hồng 500ml', price: 420000, category: 'skincare', image: 'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?w=500', stock: 35, description: 'Làm sạch sâu không kích ứng' },
            { name: 'Son dưỡng Dior Lip Glow 001', price: 850000, category: 'trang-diem', image: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?w=500', stock: 15, description: 'Son dưỡng môi cao cấp' },
            { name: 'Kem chống nắng La Roche-Posay', price: 495000, category: 'skincare', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500', stock: 60, description: 'Chống nắng hoàn hảo' }
        ];
        for (const p of sampleProducts) {
            await db.collection('products').add({ ...p, createdAt: new Date().toISOString() });
        }
        return (await db.collection('products').get()).docs.map(doc => ({ ...doc.data(), id: doc.id, _id: doc.id }));
    }

    if (snap.empty && collection === 'categories') {
        console.log("Server: Seeding sample categories...");
        const sampleCats = [
            { name: 'Trang điểm', slug: 'trang-diem' },
            { name: 'Skincare', slug: 'skincare' },
            { name: 'Bodycare', slug: 'bodycare' },
            { name: 'Haircare', slug: 'haircare' }
        ];
        for (const c of sampleCats) {
            await db.collection('categories').add(c);
        }
        return (await db.collection('categories').get()).docs.map(doc => ({ ...doc.data(), id: doc.id, _id: doc.id }));
    }

    return snap.docs.map(doc => ({ ...doc.data(), id: doc.id, _id: doc.id }));
}

// Admin Setup Helper (Run once or check)
async function ensureAdminUser() {
    if (!db) return;
    const adminEmail = 'hienng16122005@gmail.com';
    const snap = await db.collection('users').where('email', '==', adminEmail).get();
    if (snap.empty) {
        console.log(`Server: Creating admin user for ${adminEmail}`);
        // We don't have the UID yet, but we can pre-create a document or handle it in login logic
        // For security, it's better to wait for first login, then use a script to set role
    }
}
ensureAdminUser();

const app = express();
app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.use('/public', express.static(publicDir));

// --- API ---

// Products
app.get('/api/products', async (req, res) => {
    try {
        const products = await getFirestoreData('products');
        res.json(products);
    } catch (e) { res.status(500).json([]); }
});

// Categories
app.get('/api/categories', async (req, res) => {
    try {
        const cat = await getFirestoreData('categories');
        if (cat.length > 0) return res.json(cat);
        // Default categories if Firestore is empty
        res.json([
            { id: 'C1', name: 'Trang điểm', slug: 'trang-diem' },
            { id: 'C2', name: 'Skincare', slug: 'skincare' }
        ]);
    } catch (e) { res.status(500).json([]); }
});

// Magazine
app.get('/api/magazine', async (req, res) => {
    try {
        const mag = await getFirestoreData('magazine');
        res.json(mag);
    } catch (e) { res.status(500).json([]); }
});

// Website Config
app.get('/api/config', async (req, res) => {
    try {
        if (!db) return res.json({ hotline: '1900 1234', email: 'contact@qhskinlab.com' });
        const doc = await db.collection('settings').doc('website').get();
        if (doc.exists) return res.json(doc.data());
        res.json({ hotline: '1900 1234', email: 'contact@qhskinlab.com' });
    } catch (e) { res.json({ hotline: '1900 1234', email: 'contact@qhskinlab.com' }); }
});

// Auth Middleware (Firebase Only)
const adminAuth = async (req, res, next) => {
    const token = req.headers['authorization']?.split('Bearer ')[1] || req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    if (!db) return res.status(503).json({ message: 'Firebase not configured' });

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists && userDoc.data().role === 'Quản trị viên') {
            req.user = userDoc.data();
            return next();
        }
        res.status(403).json({ message: 'Forbidden' });
    } catch (e) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

app.get('/api/admin/users', adminAuth, async (req, res) => {
    const users = await getFirestoreData('users');
    res.json(users);
});

app.get('/api/admin/orders', adminAuth, async (req, res) => {
    const orders = await getFirestoreData('orders');
    res.json(orders);
});

// HTML Routing
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const pages = ['index', 'admin', 'category', 'magazine', 'product-detail', 'contact', 'about', 'policy', 'support'];
pages.forEach(p => {
    const route = `/${p}`;
    const file = path.join(__dirname, `${p}.html`);
    app.get(route, (req, res) => { if (fs.existsSync(file)) res.sendFile(file); else res.status(404).send('Page not found'); });
    app.get(`${route}.html`, (req, res) => { if (fs.existsSync(file)) res.sendFile(file); else res.status(404).send('Page not found'); });
});

app.get('/:page.html', (req, res) => {
    const file = path.join(__dirname, `${req.params.page}.html`);
    if (fs.existsSync(file)) res.sendFile(file);
    else res.status(404).send('Page not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
