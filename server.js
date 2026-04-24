require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

// Helper tạo ID ngẫu nhiên ngắn, khó đoán
const generateId = (prefix = '') => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = prefix;
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// File paths
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const MAGAZINE_FILE = path.join(DATA_DIR, 'magazine.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Helpers
const fileLocks = {};

/**
 * Đảm bảo các thao tác với file được thực hiện tuần tự để tránh Race Condition
 */
const runTask = async (file, task) => {
    if (!fileLocks[file]) fileLocks[file] = Promise.resolve();
    
    // Xếp hàng các task cho từng file riêng biệt
    const currentTask = fileLocks[file].then(async () => {
        try {
            return await task();
        } catch (e) {
            console.error(`Lỗi thực thi task trên file ${file}:`, e);
            throw e;
        }
    });
    
    fileLocks[file] = currentTask.catch(() => {}); // Tiếp tục hàng đợi ngay cả khi task trước lỗi
    return currentTask;
};

const readJSON = (file) => {
    try {
        if (!fs.existsSync(file)) {
            if (file === CATEGORIES_FILE) return [
                { id: 'C1', name: 'Trang điểm', slug: 'trang-diem' },
                { id: 'C2', name: 'Chăm sóc da mặt', slug: 'skincare' },
                { id: 'C3', name: 'Chăm sóc cơ thể', slug: 'bodycare' },
                { id: 'C4', name: 'Chăm sóc tóc', slug: 'haircare' }
            ];
            if (file === CONFIG_FILE) return { hotline: '1900 1234', email: 'contact@qhskinlab.com' };
            return [];
        }
        const content = fs.readFileSync(file, 'utf8');
        return content ? JSON.parse(content) : [];
    } catch (e) { 
        console.error("Lỗi đọc file:", file, e);
        return []; 
    }
};

const writeJSON = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) { 
        console.error("Lỗi ghi file:", file, e);
        return false; 
    }
};

const app = express();
app.use(cors());
app.use(express.json());

// Log requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

const publicDir = path.join(__dirname, 'public');
const root = __dirname;
app.use(express.static(publicDir));
app.use('/public', express.static(publicDir));

// --- API ---

// --- PUBLIC API ---

// Products: Lấy danh sách sản phẩm
app.get('/api/products', (req, res) => {
    const products = readJSON(PRODUCTS_FILE).map(p => ({ ...p, _id: p.id })); // Alias _id for frontend compatibility
    res.json(products);
});

// Categories: Lấy danh sách danh mục
app.get('/api/categories', (req, res) => {
    res.json(readJSON(CATEGORIES_FILE));
});

// Magazine: Lấy bài viết
app.get('/api/magazine', (req, res) => {
    const magazine = readJSON(MAGAZINE_FILE).map(m => ({ ...m, _id: m.id }));
    res.json(magazine);
});

// Config: Website settings
app.get('/api/config', (req, res) => {
    res.json(readJSON(CONFIG_FILE));
});

// --- ADMIN API ---

// Middleware xác thực người dùng (Dùng chung cho cả Admin và Khách)
const userAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục' });

    const sessions = readJSON(SESSIONS_FILE);
    const session = sessions.find(s => s.token === token);
    
    if (!session) return res.status(401).json({ message: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại' });

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === session.email);
    
    if (user) {
        req.user = user;
        next();
    } else {
        res.status(401).json({ message: 'Không tìm thấy thông tin người dùng' });
    }
};

// Middleware kiểm tra quyền Admin
const adminAuth = (req, res, next) => {
    userAuth(req, res, () => {
        if (req.user && req.user.role === 'Quản trị viên') {
            next();
        } else {
            res.status(403).json({ message: 'Bạn không có quyền truy cập vùng Quản trị' });
        }
    });
};

// Lấy danh sách người dùng (Admin)
app.get('/api/admin/users', adminAuth, (req, res) => {
    const users = readJSON(USERS_FILE).map(u => ({ 
        id: u.id, 
        email: u.email, 
        name: u.name, 
        role: u.role,
        createdAt: u.createdAt 
    }));
    res.json(users);
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
    try {
        const result = await runTask(USERS_FILE, () => {
            let users = readJSON(USERS_FILE);
            const filtered = users.filter(u => u.id.toString() !== req.params.id.toString());
            if (users.length === filtered.length) return { status: 404, message: 'Không tìm thấy người dùng' };
            writeJSON(USERS_FILE, filtered);
            return { status: 200, message: 'Đã xóa người dùng' };
        });
        res.status(result.status).json({ message: result.message });
    } catch (e) { res.status(500).json({ message: 'Lỗi server' }); }
});

// Thống kê Admin (Stats)
app.get('/api/admin/stats', adminAuth, (req, res) => {
    const orders = readJSON(ORDERS_FILE);
    const products = readJSON(PRODUCTS_FILE);
    const users = readJSON(USERS_FILE);
    
    const revenue = orders.filter(o => o.status === 'Đã hoàn thành' || o.status === 'Đã giao' || o.isPaid).reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const newOrders = orders.filter(o => o.status === 'Chờ xác nhận').length;
    const lowStock = products.filter(p => (p.stock || 0) < 10).length;
    
    res.json({
        revenue,
        newOrders,
        totalProducts: products.length,
        totalOrders: orders.length,
        totalUsers: users.length,
        lowStock
    });
});

// Lấy danh sách đơn hàng (Admin)
app.get('/api/admin/orders', adminAuth, (req, res) => {
    const orders = readJSON(ORDERS_FILE).map(o => ({ ...o, _id: o.id }));
    res.json(orders);
});

// Thêm sản phẩm mới (Admin)
app.post('/api/admin/products', adminAuth, async (req, res) => {
    try {
        const product = await runTask(PRODUCTS_FILE, () => {
            const newProduct = req.body;
            let products = readJSON(PRODUCTS_FILE);
            newProduct.id = generateId('P'); // Tạo ID dạng Pxxxxxxxxx
            newProduct.createdAt = new Date().toISOString();
            products.unshift(newProduct);
            writeJSON(PRODUCTS_FILE, products);
            return { ...newProduct, _id: newProduct.id };
        });
        res.json({ message: 'Thêm sản phẩm thành công', product });
    } catch (e) { res.status(500).json({ message: 'Lỗi server' }); }
});

// Cập nhật sản phẩm (Admin)
app.put('/api/admin/products/:id', adminAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const updatedProduct = await runTask(PRODUCTS_FILE, () => {
            let products = readJSON(PRODUCTS_FILE);
            const index = products.findIndex(p => p.id.toString() === id.toString());
            if (index === -1) return null;
            products[index] = { ...products[index], ...req.body, id: id };
            writeJSON(PRODUCTS_FILE, products);
            return products[index];
        });

        if (!updatedProduct) return res.status(404).json({ message: 'Không tìm thấy' });
        res.json({ message: 'Cập nhật thành công', product: updatedProduct });
    } catch (e) { res.status(500).json({ message: 'Lỗi server' }); }
});

// Quản lý Danh mục
app.post('/api/categories', adminAuth, async (req, res) => {
    await runTask(CATEGORIES_FILE, () => {
        let categories = readJSON(CATEGORIES_FILE);
        const newCat = req.body;
        const existing = categories.findIndex(c => c.slug === newCat.slug);
        if (existing !== -1) categories[existing] = { ...categories[existing], ...newCat };
        else categories.push(newCat);
        writeJSON(CATEGORIES_FILE, categories);
    });
    res.json({ message: 'Lưu danh mục thành công' });
});

app.delete('/api/categories/:id', adminAuth, async (req, res) => {
    await runTask(CATEGORIES_FILE, () => {
        let categories = readJSON(CATEGORIES_FILE);
        categories = categories.filter(c => c.id.toString() !== req.params.id.toString());
        writeJSON(CATEGORIES_FILE, categories);
    });
    res.json({ message: 'Đã xóa danh mục' });
});

// Quản lý Magazine
app.post('/api/magazine', adminAuth, async (req, res) => {
    const post = await runTask(MAGAZINE_FILE, () => {
        let magazine = readJSON(MAGAZINE_FILE);
        const newPost = req.body;
        newPost.id = generateId('MAG-'); // Tạo ID dạng MAG-xxxxxxxxx
        newPost.createdAt = new Date().toISOString();
        magazine.unshift(newPost);
        writeJSON(MAGAZINE_FILE, magazine);
        return newPost;
    });
    res.json(post);
});

app.put('/api/magazine/:id', adminAuth, async (req, res) => {
    const result = await runTask(MAGAZINE_FILE, () => {
        const id = req.params.id;
        let magazine = readJSON(MAGAZINE_FILE);
        const index = magazine.findIndex(m => m.id === id);
        if (index === -1) return false;
        magazine[index] = { ...magazine[index], ...req.body, id };
        writeJSON(MAGAZINE_FILE, magazine);
        return true;
    });
    if (!result) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    res.json({ message: 'Cập nhật bài viết thành công' });
});

app.delete('/api/magazine/:id', adminAuth, async (req, res) => {
    await runTask(MAGAZINE_FILE, () => {
        let magazine = readJSON(MAGAZINE_FILE);
        const filtered = magazine.filter(m => m.id !== req.params.id);
        writeJSON(MAGAZINE_FILE, filtered);
    });
    res.json({ message: 'Đã xóa bài viết' });
});

// Quản lý Config
app.post('/api/config', adminAuth, async (req, res) => {
    await runTask(CONFIG_FILE, () => {
        writeJSON(CONFIG_FILE, req.body);
    });
    res.json({ message: 'Cập nhật thành công' });
});

// Quản lý Đơn hàng (Cập nhật trạng thái)
app.put('/api/orders/:id', adminAuth, async (req, res) => {
    const result = await runTask(ORDERS_FILE, () => {
        const id = req.params.id;
        let orders = readJSON(ORDERS_FILE);
        const index = orders.findIndex(o => o.id === id);
        if (index === -1) return false;
        orders[index].status = req.body.status;
        writeJSON(ORDERS_FILE, orders);
        return true;
    });
    if (!result) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json({ message: 'Cập nhật trạng thái thành công' });
});

app.put('/api/orders/:id/pay', adminAuth, async (req, res) => {
    const result = await runTask(ORDERS_FILE, () => {
        const id = req.params.id;
        let orders = readJSON(ORDERS_FILE);
        const index = orders.findIndex(o => o.id === id);
        if (index === -1) return false;
        orders[index].isPaid = true;
        orders[index].status = 'Đã thanh toán';
        writeJSON(ORDERS_FILE, orders);
        return true;
    });
    if (!result) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json({ message: 'Xác nhận thanh toán thành công' });
});

// Xóa sản phẩm (Admin)
app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
    await runTask(PRODUCTS_FILE, () => {
        const id = req.params.id;
        let products = readJSON(PRODUCTS_FILE);
        products = products.filter(p => p.id.toString() !== id.toString());
        writeJSON(PRODUCTS_FILE, products);
    });
    res.json({ message: 'Đã xóa sản phẩm' });
});

// Orders: Đặt hàng (Yêu cầu đăng nhập)
app.post('/api/orders', userAuth, async (req, res) => {
    try {
        const orderData = req.body;
        const items = orderData.items || [];
        
        // Luôn sử dụng email từ session bảo mật, không tin tưởng email gửi từ client
        const authenticatedEmail = req.user.email;
        if (orderData.customerInfo) {
            orderData.customerInfo.email = authenticatedEmail;
        }

        // 1. Kiểm tra tồn kho và cập nhật Products (Atomic task)
        await runTask(PRODUCTS_FILE, () => {
            let products = readJSON(PRODUCTS_FILE);
            const updates = [];

            for (const item of items) {
                const targetId = (item._id || item.id || '').toString();
                const pIndex = products.findIndex(p => p.id.toString() === targetId);
                
                if (pIndex === -1) {
                    throw new Error(`Sản phẩm ${targetId} không tồn tại trong hệ thống.`);
                }
                
                const product = products[pIndex];
                const qty = parseInt(item.quantity || 1);
                const currentStock = parseInt(product.stock || 0);

                if (currentStock < qty) {
                    throw new Error(`Sản phẩm "${product.name}" không đủ hàng (Hiện còn: ${currentStock}, Cần: ${qty})`);
                }

                updates.push({ index: pIndex, qty });
            }

            // Nếu tất cả ok, tiến hành trừ kho và tăng số lượng đã bán
            updates.forEach(u => {
                products[u.index].stock = parseInt(products[u.index].stock || 0) - u.qty;
                products[u.index].sold = (parseInt(products[u.index].sold || 0)) + u.qty;
            });

            writeJSON(PRODUCTS_FILE, products);
        });

        // 2. Lưu Đơn hàng
        const order = await runTask(ORDERS_FILE, () => {
            const newOrder = req.body;
            let orders = readJSON(ORDERS_FILE);
            newOrder.id = 'ORD-' + Date.now();
            newOrder.createdAt = new Date().toISOString();
            orders.unshift(newOrder);
            writeJSON(ORDERS_FILE, orders);
            return newOrder;
        });

        res.json({ message: 'Thành công', orderId: order.id, order: order });
    } catch (e) {
        console.error("Lỗi đặt hàng:", e.message);
        res.status(400).json({ message: e.message || 'Lỗi xử lý đơn hàng' });
    }
});

// Lấy đơn hàng của tôi (Dựa trên session)
app.get('/api/orders/myorders', userAuth, (req, res) => {
    const email = req.user.email;
    const orders = readJSON(ORDERS_FILE);
    const myOrders = orders.filter(o => o.customerInfo && o.customerInfo.email === email);
    res.json(myOrders);
});

// Users: Đăng ký/Đăng nhập (Giản lược tối đa)
app.post('/api/users', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const user = await runTask(USERS_FILE, async () => {
            let users = readJSON(USERS_FILE);
            if (users.find(u => u.email === email)) return null;

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = {
                id: generateId('U'), // Tạo ID dạng Uxxxxxxxxx
                name: name,
                email: email,
                password: hashedPassword,
                role: email === 'admin@qh.com' ? 'Quản trị viên' : 'Khách hàng',
                createdAt: new Date().toISOString()
            };
            users.push(newUser);
            writeJSON(USERS_FILE, users);
            return newUser;
        });

        if (!user) return res.status(400).json({ message: 'Email đã tồn tại' });

        // Tự động tạo session token sau khi đăng ký thành công
        const sessionToken = generateId('SES-');
        await runTask(SESSIONS_FILE, () => {
            let sessions = readJSON(SESSIONS_FILE);
            sessions.push({
                token: sessionToken,
                email: user.email,
                createdAt: new Date().toISOString()
            });
            writeJSON(SESSIONS_FILE, sessions);
        });

        res.json({ name: user.name, email: user.email, role: user.role, token: sessionToken });
    } catch (e) {
        res.status(500).json({ message: 'Lỗi đăng ký' });
    }
});

app.post('/api/users/login', async (req, res) => {
    const { email, password } = req.body;
    let users = readJSON(USERS_FILE);
    let user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(400).json({ message: 'Tài khoản không tồn tại. Vui lòng đăng ký!' });
    } else {
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Sai mật khẩu' });
    }

    // Tạo Session Token bảo mật
    const sessionToken = generateId('SES-');
    await runTask(SESSIONS_FILE, () => {
        let sessions = readJSON(SESSIONS_FILE);
        // Lưu session (có thể xóa các session cũ của user này nếu muốn)
        sessions = sessions.filter(s => s.email !== email);
        sessions.push({
            token: sessionToken,
            email: email,
            createdAt: new Date().toISOString()
        });
        writeJSON(SESSIONS_FILE, sessions);
    });

    res.json({ name: user.name, email: user.email, role: user.role, token: sessionToken });
});

app.get('/api/users/admin-check', (req, res) => {
    const token = req.headers['x-admin-token'];
    if (!token) return res.json({ isAdmin: false });
    
    const sessions = readJSON(SESSIONS_FILE);
    const session = sessions.find(s => s.token === token);
    if (!session) return res.json({ isAdmin: false });

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === session.email && u.role === 'Quản trị viên');
    res.json({ isAdmin: !!user });
});

app.get('/api/ping', (req, res) => res.json({ status: 'ok', time: new Date() }));

// --- HTML ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const pages = ['index', 'admin', 'category', 'magazine', 'product-detail', 'contact', 'about', 'policy', 'support'];
pages.forEach(p => {
    const route = `/${p}`;
    const file = path.join(__dirname, `${p}.html`);
    
    app.get(route, (req, res) => {
        if (fs.existsSync(file)) res.sendFile(file);
        else res.status(404).send('Page not found');
    });
    
    app.get(`${route}.html`, (req, res) => {
        if (fs.existsSync(file)) res.sendFile(file);
        else res.status(404).send('Page not found');
    });
});

// Catch-all for other HTML files in root
app.get('/:page.html', (req, res) => {
    const file = path.join(__dirname, `${req.params.page}.html`);
    if (fs.existsSync(file)) res.sendFile(file);
    else res.status(404).send('Page not found');
});

app.listen(3000, '0.0.0.0', () => {
    console.log('Server is running on port 3000 (DIRECT STORAGE MODE)');
});
