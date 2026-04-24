const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Mock data copied from server.js
const mockProducts = [
    {
        _id: "p1", name: '[NEW DEW] Son Tint Bóng Merzy Dạng Thạch The Watery Dew Tint', brand: 'Merzy', category: 'trang-diem-son-moi', price: 179000, oldPrice: 309000, discount: '42%',
        image: 'https://product.hstatic.net/1000006063/product/wd23_c168ab0ee2c24edda27693a18de15bb5_1024x1024.jpg',
        images: ['https://product.hstatic.net/1000006063/product/wd23_c168ab0ee2c24edda27693a18de15bb5_1024x1024.jpg', 'https://cdn.hstatic.net/products/1000006063/36_3232d9509c31426c9ea371625b3fc168_1024x1024.png'],
        details: 'Son Tint Bóng Dạng Thạch Merzy The Watery Dew Tint lấy cảm hứng từ tinh thần Old Money, mang lại đôi môi căng mọng, bền màu suốt ngày dài.',
        specs: { 'Chất son': 'Son thạch, son tint', 'Dung tích': '4g', 'Thương hiệu': 'Merzy (Hàn Quốc)', 'Nơi sản xuất': 'Hàn Quốc' },
        sold: 25200, stock: 100
    },
    {
        _id: "p2", name: 'Serum Chống Nắng B.O.M Water Glow Sun Serum SPF50+PA++++ 50g', brand: 'B.O.M', category: 'skincare', price: 438000, oldPrice: 548000, discount: '20%',
        image: 'https://cdn.hstatic.net/products/1000006063/bt_770a3fcae16d4350ad40ad252a1805fb_1024x1024.jpg',
        images: ['https://cdn.hstatic.net/products/1000006063/bt_770a3fcae16d4350ad40ad252a1805fb_1024x1024.jpg', 'https://cdn.hstatic.net/products/1000006063/download_761a7597092b4c799c8d06e2f284d44c_1024x1024.jpg'],
        details: 'Tinh chất chống nắng bảo vệ da phổ rộng, cấp ẩm vượt trội với 89% thành phần dưỡng da.',
        specs: { 'Dung tích': '50g', 'Chỉ số': 'SPF50+ PA++++', 'Thương hiệu': 'B.O.M (Hàn Quốc)', 'Loại da': 'Mọi loại da' },
        sold: 1500, stock: 50
    },
    {
        _id: "p3", name: 'Kem Chống Nắng La Roche-Posay Anthelios UVMune 400 SPF50+', brand: 'La Roche-Posay', category: 'skincare', price: 449000, oldPrice: 640000, discount: '30%',
        image: 'https://product.hstatic.net/1000006063/product/bth_b1850e1e326b4a60ab803afca16b55af_1024x1024.jpg',
        images: ['https://product.hstatic.net/1000006063/product/bth_b1850e1e326b4a60ab803afca16b55af_1024x1024.jpg', 'https://cdn.hstatic.net/products/1000006063/22_2d9c2cc106af4ff5a8b76a5eabf5a099_1024x1024.png'],
        details: 'Dòng sản phẩm bảo vệ da toàn diện trước tia UVA dài, ngăn ngừa thâm nám và lão hóa sớm.',
        specs: { 'Dung tích': '50ml', 'Thương hiệu': 'La Roche-Posay (Pháp)', 'Kết cấu': 'Dạng sữa lỏng', 'Đặc tính': 'Không nhờn rít' },
        sold: 3200, stock: 80
    }
];

const mockCategories = [
    { id: 1, name: 'Trang điểm', slug: 'trang-diem' },
    { id: 2, name: 'Chăm sóc da', slug: 'skincare' },
    { id: 3, name: 'Dưỡng thể', slug: 'bodycare' },
    { id: 4, name: 'Tóc & Da đầu', slug: 'haircare' }
];

async function seed() {
    const configPath = path.join(__dirname, 'firebase-applet-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!admin.apps.length) {
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                }),
                projectId: config.projectId
            });
        } else {
            admin.initializeApp({
                projectId: config.projectId
            });
        }
    }

    const { getFirestore } = require('firebase-admin/firestore');
    const db = config.firestoreDatabaseId ? getFirestore(admin.app(), config.firestoreDatabaseId) : getFirestore(admin.app());

    console.log('Seeding categories...');
    for (const cat of mockCategories) {
        await db.collection('categories').doc(cat.slug).set(cat);
    }

    console.log('Seeding products...');
    for (const prod of mockProducts) {
        const { _id, ...data } = prod;
        await db.collection('products').doc(_id).set(data);
    }

    console.log('Seed completed successfully!');
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
