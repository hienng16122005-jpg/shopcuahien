/**
 * Q&H SKINLAB CLONE - ADVANCED LOGIC
 */

/// 1. DATA
const API_BASE_URL = '/api';

// 2. STATE & GLOBALS
let products = [];
try {
    const cached = localStorage.getItem('qh_products_cache');
    if (cached) products = JSON.parse(cached);
} catch (e) {
    console.warn("Product cache corrupted", e);
}
let filteredProducts = [...products];

let isLoggedIn = !!localStorage.getItem('qh_userEmail');
let currentUserName = localStorage.getItem('qh_userName') || '';
let cart = JSON.parse(localStorage.getItem('qh_cart')) || [];
let currentSlide = 0;
let currentCheckoutItems = []; 
let isDirectCheckout = false;

/**
 * Khởi tạo/Đồng bộ trạng thái người dùng trên UI
 */
function initUserSession() {
    isLoggedIn = !!localStorage.getItem('qh_userEmail');
    currentUserName = localStorage.getItem('qh_userName') || '';
    const currentUserEmail = localStorage.getItem('qh_userEmail') || '';
    
    const display = document.getElementById('userNameDisplay');
    const adminBtn = document.getElementById('adminPanelBtn');
    const accountTrigger = document.getElementById('accountTrigger');
    
    if (isLoggedIn) {
        if (display) {
            display.textContent = currentUserName;
            display.style.display = 'inline-block'; // HIỆN TÊN để xác nhận đã đăng nhập
        }
        if (accountTrigger) accountTrigger.style.color = '#e74c3c';
        checkAdminStatus(); 
    } else {
        if (display) {
            display.textContent = '';
            display.style.display = 'none';
        }
        if (adminBtn) adminBtn.style.display = 'none';
        if (accountTrigger) accountTrigger.style.color = 'inherit';
    }
}

async function checkAdminStatus() {
    const token = localStorage.getItem('qh_sessionToken');
    if (!token) return;
    try {
        const res = await fetch(`/api/users/admin-check`, {
            headers: { 'x-admin-token': token }
        });
        const data = await res.json();
        const adminBtn = document.getElementById('adminPanelBtn');
        if (data.isAdmin && adminBtn) {
            adminBtn.style.display = 'block';
        }
    } catch (e) {}
}

const BRAND_BANNERS = {
    'drceutics': 'https://tse1.mm.bing.net/th/id/OIP.OfyLfasSBQ7Dja8o83btaQHaNK?rs=1&pid=ImgDetMain&o=7&rm=3',
    'cocoon': 'https://the7.vn/wp-content/uploads/2024/08/Cac-san-pham-cua-Cocoon-hoan-toan-duoc-che-tao-tu-nguyen-lieu-thien-nhien-thuan-chay-tinh-khiet-va-an-toan-768x862.png',
    'anessa': 'https://tse2.mm.bing.net/th/id/OIP.ycvbSJjumqoI8uMfUS-dawHaHa?rs=1&pid=ImgDetMain&o=7&rm=3',
    'la roche-posay': 'https://tse4.mm.bing.net/th/id/OIP.KOH318hculZu7fs-k0hRFAHaLH?rs=1&pid=ImgDetMain&o=7&rm=3',
    'b.o.m': 'https://media.hcdn.vn/catalog/product/s/o/son-li-b-o-m-808-do-dat-ban-gioi-han-2024-3-1g-1-1727926367_img_800x800_eb97c5_fit_center.jpg',
    'merzy': 'https://theme.hstatic.net/1000362438/1000729754/14/hg_img3.png?v=949'
};

/**
 * Hàm fetch API an toàn: Kiểm tra response.ok, log text() khi lỗi và chỉ parse JSON khi hợp lệ
 */
async function safeFetch(url, options = {}) {
    // Tự động tiêm token admin nếu có
    const token = localStorage.getItem('qh_sessionToken');
    if (token) {
        options.headers = {
            ...options.headers,
            'x-admin-token': token
        };
    }

    // Chỉ thêm cache-busting cho GET để tránh lỗi với một số proxy/server cấu hình khắt khe khi POST
    let freshUrl = url;
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    
    if (isGet) {
        const separator = url.includes('?') ? '&' : '?';
        freshUrl = (url.startsWith('http') || url.startsWith('/')) 
            ? `${url}${separator}t=${Date.now()}` 
            : url;
    }

    try {
        const response = await fetch(freshUrl, options);
        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
            let errorMessage = `Lỗi ${response.status}`;
            try {
                if (contentType.includes("application/json")) {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                } else {
                    const errorText = await response.text();
                    if (errorText && errorText.length < 200) errorMessage = errorText;
                }
            } catch (e) {
                console.error("Lỗi parse phản hồi khi fetch:", e);
            }
            throw new Error(errorMessage);
        }

        if (contentType.includes("application/json")) {
            return await response.json();
        }
        
        // Nếu không phải JSON nhưng OK, trả về text hoặc true tùy ngữ cảnh
        return await response.text();
    } catch (err) {
        console.error("Lỗi SafeFetch:", err);
        throw err;
    }
}

// --- Mẫu dữ liệu sản phẩm mặc định ---
const DEFAULT_PRODUCTS = [
    {
        id: "1",
        name: "[NEW DEW] Son Tint Bóng Merzy Dạng Thạch",
        brand: "Merzy",
        category: "trang-diem-son-moi",
        price: 179000,
        oldPrice: 309000,
        image: "https://product.hstatic.net/1000006063/product/wd23_c168ab0ee2c24edda27693a18de15bb5_1024x1024.jpg"
    }
];

// Khởi tạo state từ dữ liệu mặc định nếu cache trống
if (products.length === 0) {
    products = [...DEFAULT_PRODUCTS];
    filteredProducts = [...products];
}

let magazinePosts = []; 

async function loadInitialData() {
    console.log("Q&H: Bắt đầu tải dữ liệu khởi tạo...");
    
    // 1. Render ngay nếu đã có sản phẩm (từ cache)
    if (products.length > 0) {
        renderAllSections();
    }

    try {
        // 2. Chạy các fetch song song dùng fetch tiêu chuẩn
        const configPromise = fetch('/api/config').then(r => r.ok ? r.json() : null).catch(() => null);
        const productsPromise = fetch('/api/products').then(r => r.ok ? r.json() : null).catch(() => null);
        const magazinePromise = fetch('/api/magazine').then(r => r.ok ? r.json() : null).catch(() => null);

        // Đợi cấu hình và sản phẩm trước (quan trọng nhất)
        const [configData, prodData] = await Promise.all([configPromise, productsPromise]);

        if (configData) {
            console.log("Q&H: Đã tải Config", configData);
            updateWebsiteConfig(configData);
        }

        if (prodData && Array.isArray(prodData)) {
            console.log("Q&H: Đã tải", prodData.length, "sản phẩm");
            products = prodData;
            filteredProducts = [...products];
            // ⭐ LỚI LẦN 1 FIX: LƯU PRODUCTS VÀO GLOBAL VARIABLE VÀ CACHE
            window.allProducts = products;
            localStorage.setItem('qh_products_cache', JSON.stringify(products));
            
            // Render lại ngay khi có sản phẩm mới từ server
            renderAllSections();
        }

        // Đợi bài viết magazine sau
        const magData = await magazinePromise;
        if (magData && Array.isArray(magData)) {
            console.log("Q&H: Đã tải", magData.length, "bài viết");
            magazinePosts = magData;
            // Render lại lần nữa cho magazine
            renderAllSections();
        }
    } catch (error) {
        console.error("Q&H: Lỗi tải dữ liệu khởi tạo:", error);
        if (products.length === 0) renderAllSections();
    }
}

// ===== CẬP NHẬT HÀM HELPER =====
window.getProducts = function() {
    // Luôn ưu tiên products hiện tại, nếu trống thử cache
    if (products && products.length > 0) return products;
    if (window.allProducts && window.allProducts.length > 0) return window.allProducts;
    
    try {
        const cached = localStorage.getItem('qh_products_cache');
        if (cached) {
            products = JSON.parse(cached);
            filteredProducts = [...products];
            return products;
        }
    } catch (e) {}
    return products || [];
};

function updateWebsiteConfig(cfg) {
    if (!cfg) return;
    const hotlineElements = document.querySelectorAll('#headerHotline, .footer-hotline');
    hotlineElements.forEach(el => {
        if (el) el.textContent = `Hotline: ${cfg.hotline}`;
    });
}

async function loadProductsFromServer() {
    await loadInitialData();
}

/**
 * Các bài viết mẫu (Dùng khi không kết nối được server)
 */
const MOCK_MAGAZINE_POSTS = [
    {
        id: 'mock-1',
        title: "Bí quyết trang điểm tự nhiên như không cho nàng công sở",
        category: "makeup-tips",
        createdAt: "2026-04-06T10:00:00Z",
        description: "Làm thế nào để có một lớp nền mỏng nhẹ, tự nhiên nhưng vẫn che được khuyết điểm?",
        image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=80"
    }
];

function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// 3. INIT
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('admin.html')) {
        return;
    }
    
    injectRequiredElements();
    initEvents(); // Hàm này chứa window.initCheckoutListeners()

    // Khởi tạo trạng thái phiên người dùng
    initUserSession();

    loadProductsFromServer();
    
    updateCartUI();
    startSlider();
    startCountdown();
});

function renderAllSections() {
    if (document.getElementById('productGrid')) renderProducts();
    if (document.getElementById('flashSaleGrid')) renderFlashSale();
    if (document.getElementById('merzyProductsGrid')) renderMerzyProducts();
    if (document.getElementById('makeupGrid')) renderMakeupProducts();
    if (document.getElementById('sunCareGrid')) renderSunCareProducts();
    if (document.getElementById('maskGrid')) renderMaskProducts();
    if (document.getElementById('localBrandGrid')) renderLocalBrandProducts();
    if (document.getElementById('skinCareSectionGrid')) renderSkinCareSectionProducts();
    if (document.getElementById('bodyCareSectionGrid')) renderBodyCareSectionProducts();
    if (document.getElementById('hairCareGrid')) renderHairCareProducts();
    if (document.getElementById('makeupSectionGrid')) renderMakeupSectionProducts();
    updateHomeSectionCounts();
    initHorizontalProductScroll();

    // Xử lý các trang đặc biệt
    const path = window.location.pathname;
    if (path.includes('category.html')) handleCategoryPage();
    if (path.includes('magazine.html') && !path.includes('detail')) handleMagazinePage();
    if (path.includes('magazine-detail.html')) handleMagazineDetailPage();
}

function initHorizontalProductScroll() {
    const grids = document.querySelectorAll('.products-grid');

    grids.forEach((grid) => {
        if (grid.dataset.hScrollInit === '1') return;
        grid.dataset.hScrollInit = '1';

        let isDown = false;
        let startX;
        let scrollLeft;
        let isDragging = false;
        
        // --- Hover Auto Scroll Logic ---
        let hoverSpeed = 0;
        let targetHoverSpeed = 0;
        let rafId = null;

        const lerp = (start, end, amt) => (1 - amt) * start + amt * end;

        const tickAutoScroll = () => {
            // Làm mượt tốc độ cuộn bằng lerp
            hoverSpeed = lerp(hoverSpeed, targetHoverSpeed, 0.1);
            
            if (Math.abs(hoverSpeed) > 0.1) {
                grid.classList.add('no-snap'); 
                grid.scrollLeft += hoverSpeed;
                rafId = requestAnimationFrame(tickAutoScroll);
            } else {
                grid.classList.remove('no-snap');
                hoverSpeed = 0;
                rafId = null;
            }
        };

        const updateTargetSpeed = (speed) => {
            targetHoverSpeed = speed;
            if (targetHoverSpeed !== 0 && !rafId) {
                rafId = requestAnimationFrame(tickAutoScroll);
            }
        };

        // --- Drag Logic ---
        grid.addEventListener('mousedown', (e) => {
            isDown = true;
            isDragging = false;
            grid.classList.add('grabbing');
            startX = e.pageX - grid.offsetLeft;
            scrollLeft = grid.scrollLeft;
            grid.style.scrollBehavior = 'auto'; // Tắt smooth của CSS khi đang kéo manual
            updateTargetSpeed(0); // Dừng auto scroll khi đang kéo
        });

        grid.addEventListener('mouseleave', () => {
            isDown = false;
            grid.classList.remove('grabbing');
            updateTargetSpeed(0);
        });

        grid.addEventListener('mouseup', () => {
            isDown = false;
            grid.classList.remove('grabbing');
            grid.style.scrollBehavior = 'smooth';
            
            if (isDragging) {
                const preventClick = (e) => {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    grid.removeEventListener('click', preventClick, true);
                };
                grid.addEventListener('click', preventClick, true);
            }
        });

        grid.addEventListener('mousemove', (e) => {
            if (isDown) {
                const x = e.pageX - grid.offsetLeft;
                const walk = (x - startX) * 2;
                if (Math.abs(x - startX) > 5) {
                    isDragging = true;
                    grid.scrollLeft = scrollLeft - walk;
                }
                return;
            }

            // Hover detecting near edges
            const rect = grid.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const threshold = 120; // Vùng cảm ứng ở 2 đầu
            const maxSpeed = 15;

            if (mouseX > rect.width - threshold) {
                const intensity = (mouseX - (rect.width - threshold)) / threshold;
                updateTargetSpeed(Math.round(intensity * maxSpeed));
            } else if (mouseX < threshold) {
                const intensity = (threshold - mouseX) / threshold;
                updateTargetSpeed(-Math.round(intensity * maxSpeed));
            } else {
                updateTargetSpeed(0);
            }
        });

        // Touch support (Native is fine, but we can ensure it works well)
        grid.addEventListener('touchstart', () => {
            grid.style.scrollBehavior = 'auto';
            updateTargetSpeed(0);
        }, { passive: true });

        grid.addEventListener('touchend', () => {
            grid.style.scrollBehavior = 'smooth';
        }, { passive: true });
    });
}

// 3.1 CATEGORY PAGE LOGIC
function handleCategoryPage() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type') || 'all';
    const q = params.get('q') || '';
    const brandParam = params.get('brand') || '';
    
    const categoryMap = {
        'trang-diem': { title: 'TRANG ĐIỂM', banner: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80' },
        'skincare': { title: 'CHĂM SÓC DA', banner: 'https://images.unsplash.com/photo-1570172619384-210fa1de8bd8?auto=format&fit=crop&w=1200&q=80' },
        'bodycare': { title: 'CHĂM SÓC CƠ THỂ', banner: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80' },
        'haircare': { title: 'CHĂM SÓC TÓC', banner: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80' },
        'perfume': { title: 'NƯỚC HOA', banner: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=80' },
        'brands': { title: 'THƯƠNG HIỆU', banner: 'https://images.unsplash.com/photo-1596462502278-27bfad450526?auto=format&fit=crop&w=1200&q=80' },
        'magazine': { title: 'TẠP CHÍ LÀM ĐẸP', banner: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80' },
        'new': { title: 'SẢN PHẨM MỚI', banner: 'https://images.unsplash.com/photo-1596462502278-27bfad450526?auto=format&fit=crop&w=1200&q=80' },
        'combo': { title: 'COMBO CHĂM DA', banner: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=1200&q=80' }
    };

    let config = categoryMap[type] || { title: 'TẤT CẢ SẢN PHẨM', banner: 'https://images.unsplash.com/photo-1596462502278-27bfad450526?auto=format&fit=crop&w=1200&q=80' };

    if (q) {
        config = { title: `KẾT QUẢ TÌM KIẾM: "${q}"`, banner: 'https://images.unsplash.com/photo-1596462502278-27bfad450526?auto=format&fit=crop&w=1200&q=80' };
    } else if (brandParam) {
        config = { title: `THƯƠNG HIỆU: ${brandParam.toUpperCase()}`, banner: 'https://images.unsplash.com/photo-1596462502278-27bfad450526?auto=format&fit=crop&w=1200&q=80' };
    }

    // Update UI
    const titleEl = document.getElementById('categoryTitle');
    const bannerEl = document.getElementById('categoryBanner');
    const breadcrumbEl = document.getElementById('breadcrumbCategory');
    const breadcrumbContainer = document.querySelector('.breadcrumb');
    const gridEl = document.getElementById('categoryProductGrid');
    const countEl = document.getElementById('productCount');

    if (titleEl) titleEl.innerText = config.title;
    if (bannerEl) bannerEl.style.backgroundImage = `url('${config.banner}')`;
    if (breadcrumbEl) breadcrumbEl.innerText = config.title;

    const sidebarEl = document.querySelector('.category-sidebar');
    const layoutEl = document.querySelector('.category-layout');

    // Hide breadcrumbs and banner if searching
    if (q) {
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'block';
        if (bannerEl) bannerEl.style.display = 'flex';
        if (sidebarEl) sidebarEl.style.display = 'block';
        if (layoutEl) layoutEl.style.gridTemplateColumns = '280px 1fr';
        if (gridEl) gridEl.style.gridTemplateColumns = 'repeat(4, 1fr)';
    } else {
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'block';
        if (bannerEl) bannerEl.style.display = 'flex';
        if (sidebarEl) sidebarEl.style.display = 'block';
        if (layoutEl) layoutEl.style.gridTemplateColumns = '280px 1fr';
        if (gridEl) gridEl.style.gridTemplateColumns = 'repeat(4, 1fr)';
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput && q) {
        searchInput.value = q;
    }

    // Filter Products (Base list for sidebar to work on)
    let filtered = products;
    if (q) {
        const query = q.toLowerCase().trim();
        const queryNoAccent = removeAccents(query);
        filtered = products.filter(p => {
            const name = p.name.toLowerCase();
            const brand = p.brand.toLowerCase();
            const category = p.category.toLowerCase();
            const details = (p.details || "").toLowerCase();
            
            if (name.includes(query) || brand.includes(query) || category.includes(query) || details.includes(query)) return true;
            if (removeAccents(name).includes(queryNoAccent) || removeAccents(brand).includes(queryNoAccent) || removeAccents(category).includes(queryNoAccent) || removeAccents(details).includes(queryNoAccent)) return true;
            return false;
        });
    } else if (type === 'new') {
        filtered = products.filter(p => p.isNew);
    } else if (type === 'combo') {
        filtered = products.filter(p => p.category === 'combo');
    } else if (type !== 'all' && type !== 'brands' && type !== 'magazine') {
        // Hỗ trợ lọc cho cả slug tiếng Anh (từ URL) và tên category tiếng Việt (trong data)
        const typeMapping = {
            'skincare': 'cham-soc-da',
            'haircare': 'cham-soc-toc',
            'bodycare': 'cham-soc-body'
        };
        const targetType = typeMapping[type] || type;
        filtered = products.filter(p => 
            p.category === type || 
            p.category === targetType || 
            p.category.startsWith(type + '-') || 
            p.category.startsWith(targetType + '-')
        );
    }

    // Initial render
    if (gridEl) {
        renderFilteredProducts(filtered);
    }

    // Logic Sắp xếp
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            let sorted = [...filtered];
            if (sortSelect.value === 'price-asc') sorted.sort((a, b) => a.price - b.price);
            if (sortSelect.value === 'price-desc') sorted.sort((a, b) => b.price - a.price);
            renderFilteredProducts(sorted);
        });
    }

    function renderFilteredProducts(data) {
        if (gridEl) gridEl.innerHTML = data.map(p => createProductCard(p)).join('');
        if (countEl) countEl.innerText = data.length;
    }

    // SIDEBAR FILTER LOGIC
    const brandCheckboxes = document.querySelectorAll('.brand-checkbox');
    const priceCheckboxes = document.querySelectorAll('.price-checkbox');
    const minPriceInput = document.getElementById('minPrice');
    const maxPriceInput = document.getElementById('maxPrice');
    const applyPriceBtn = document.getElementById('applyPriceBtn');

    // Sync brandParam with checkboxes
    if (brandParam) {
        brandCheckboxes.forEach(cb => {
            if (cb.value.toLowerCase() === brandParam.toLowerCase()) {
                cb.checked = true;
            }
        });
    }

    function applySidebarFilters() {
        const selectedBrands = Array.from(brandCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value.toLowerCase());
        
        const selectedPriceRanges = Array.from(priceCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value.split('-').map(Number));

        const minPrice = parseInt(minPriceInput.value) || 0;
        const maxPrice = parseInt(maxPriceInput.value) || 999999999;

        let sidebarFiltered = filtered;

        // Filter by Brand
        if (selectedBrands.length > 0) {
            sidebarFiltered = sidebarFiltered.filter(p => selectedBrands.includes(p.brand.toLowerCase()));
        }

        // Filter by Price Range (Checkboxes)
        if (selectedPriceRanges.length > 0) {
            sidebarFiltered = sidebarFiltered.filter(p => {
                return selectedPriceRanges.some(range => p.price >= range[0] && p.price <= range[1]);
            });
        }

        // Filter by Custom Price Range (Inputs) - only if inputs are used
        if (minPriceInput.value || maxPriceInput.value) {
            sidebarFiltered = sidebarFiltered.filter(p => p.price >= minPrice && p.price <= maxPrice);
        }

        if (gridEl) {
            gridEl.innerHTML = sidebarFiltered.map(p => createProductCard(p)).join('');
        }
        if (countEl) countEl.innerText = sidebarFiltered.length;
    }

    brandCheckboxes.forEach(cb => cb.addEventListener('change', applySidebarFilters));
    priceCheckboxes.forEach(cb => cb.addEventListener('change', applySidebarFilters));
    if (applyPriceBtn) {
        applyPriceBtn.addEventListener('click', applySidebarFilters);
    }

    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            brandCheckboxes.forEach(cb => cb.checked = false);
            priceCheckboxes.forEach(cb => cb.checked = false);
            minPriceInput.value = '';
            maxPriceInput.value = '';
            applySidebarFilters();
        });
    }

    // Apply filters initially (in case brandParam is present)
    applySidebarFilters();
}

// 3.2 MAGAZINE PAGE LOGIC
function handleMagazinePage() {
    const params = new URLSearchParams(window.location.search);
    const topic = params.get('topic') || 'all';
    
    renderMagazinePosts(topic);
    
    // Sidebar active state
    const sidebarItems = document.querySelectorAll('.mag-sidebar-item');
    sidebarItems.forEach(item => {
        if (item.dataset.topic === topic) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
        
        item.addEventListener('click', () => {
            const newTopic = item.dataset.topic;
            window.history.pushState({}, '', `magazine.html?topic=${newTopic}`);
            
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            renderMagazinePosts(newTopic);
        });
    });
}

function renderMagazinePosts(topic) {
    const grid = document.getElementById('magazineGrid');
    const titleEl = document.getElementById('magazineTitle');
    const breadcrumbEl = document.getElementById('breadcrumbTopic');
    
    if (!grid) return;
    
    let filtered = magazinePosts.length > 0 ? magazinePosts : MOCK_MAGAZINE_POSTS;
    let title = "TẤT CẢ BÀI VIẾT";
    
    if (topic !== 'all') {
        filtered = filtered.filter(p => p.category === topic);
        const sidebarItems = document.querySelectorAll('.mag-sidebar-item');
        sidebarItems.forEach(item => {
            if (item.dataset.topic === topic) title = item.innerText.toUpperCase();
        });
    }
    
    if (titleEl) titleEl.innerText = title;
    if (breadcrumbEl) breadcrumbEl.innerText = title.toLowerCase();

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 100px 0; color: #999;">Chưa có bài viết trong chuyên mục này.</div>';
        return;
    }

    grid.innerHTML = filtered.map(post => `
        <div class="magazine-card" onclick="location.href='magazine-detail.html?id=${post.id}'">
            <div class="mag-card-img">
                <img src="${post.image || post.thumbnail}" alt="${post.title}" loading="lazy" referrerPolicy="no-referrer">
            </div>
            <div class="mag-card-body">
                <div class="mag-card-meta">
                    <span class="mag-card-cat" style="font-size: 11px; background: #eee; padding: 2px 6px; border-radius: 4px; color: #666; margin-bottom: 5px; display: inline-block;">${post.category}</span>
                    <div class="mag-card-date">${post.createdAt ? new Date(post.createdAt).toLocaleDateString('vi-VN') : '01/01/2026'}</div>
                </div>
                <h3 class="mag-card-title">${post.title}</h3>
                <p class="mag-card-desc">${post.description}</p>
                <span class="mag-card-more">Xem chi tiết &rarr;</span>
            </div>
        </div>
    `).join('');
}

function handleMagazineDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const post = magazinePosts.find(p => (p.id || '').toString() === (id || '').toString());
    
    if (!post) {
        // Nếu không tìm thấy, thử tìm trong mock
        const mockPost = MOCK_MAGAZINE_POSTS.find(p => p.id === id);
        if (!mockPost) {
            document.getElementById('magazineDetailContent').innerHTML = "<div style='text-align:center; padding: 100px 0;'><h3>Không tìm thấy bài viết</h3><a href='magazine.html'>Quay lại Tạp chí</a></div>";
            return;
        }
        renderMAGDetail(mockPost);
    } else {
        renderMAGDetail(post);
    }
    
    function renderMAGDetail(p) {
        if (document.getElementById('magDetailTitle')) document.getElementById('magDetailTitle').innerText = p.title;
        if (document.getElementById('magDetailDate')) document.getElementById('magDetailDate').innerText = p.createdAt ? new Date(p.createdAt).toLocaleDateString('vi-VN') : '01/01/2026';
        if (document.getElementById('magDetailCategory')) document.getElementById('magDetailCategory').innerText = p.category;
        if (document.getElementById('magDetailThumbnail')) document.getElementById('magDetailThumbnail').src = p.image || p.thumbnail;
        if (document.getElementById('magDetailBody')) document.getElementById('magDetailBody').innerHTML = p.content || p.description;
        if (document.getElementById('breadcrumbPostTitle')) document.getElementById('breadcrumbPostTitle').innerText = p.title;
    }
}

// 4. RENDER
function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    grid.innerHTML = filteredProducts.map(p => createProductCard(p)).join('');
}

/**
 * Hàm dùng chung để render một nhóm sản phẩm dựa trên bộ lọc
 */
function renderProductSection(gridId, filterFn, options = {}) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const { limit = 100, isFlashSale = false } = options;
    const allFiltered = products.filter(filterFn);
    const items = allFiltered.slice(0, limit);

    grid.innerHTML = items.map(p => createProductCard(p, isFlashSale)).join('');
}

function renderFlashSale() {
    renderProductSection('flashSaleGrid', p => parseInt(p.discount) > 30, { limit: 30, isFlashSale: true });
}

function renderMerzyProducts() {
    renderProductSection('merzyProductsGrid', p => p.brand === 'Merzy', { limit: 30 });
}

window.updateBrandSection = function(brandName, element) {
    // 1. Cập nhật banner bên cạnh cho đúng thương hiệu
    const bannerImg = document.getElementById('brandBannerImg');
    if (bannerImg) {
        const bannerUrl = BRAND_BANNERS[brandName.toLowerCase()] || `https://picsum.photos/seed/${brandName.toLowerCase()}/400/800`;
        
        bannerImg.src = bannerUrl;
        bannerImg.alt = `${brandName} Banner`;
    }

    // 2. Render lại grid sản phẩm theo thương hiệu đã chọn
    renderProductSection('merzyProductsGrid', p => p.brand.toLowerCase() === brandName.toLowerCase(), { limit: 30 });
    
    // 3. Highlight tên thương hiệu được chọn
    if (element) {
        const siblings = element.parentElement.querySelectorAll('.brand-item');
        siblings.forEach(s => s.classList.remove('active'));
        element.classList.add('active');
    }

    showToast(`Đang hiển thị sản phẩm của ${brandName}`);
};

function renderMakeupProducts() {
    renderProductSection('makeupGrid', p => p.category.startsWith('trang-diem'));
}

function renderSunCareProducts() {
    renderProductSection('sunCareGrid', p => p.name.toLowerCase().includes('sun') || p.name.toLowerCase().includes('chống nắng'));
}

function renderMaskProducts() {
    renderProductSection('maskGrid', p => p.name.toLowerCase().includes('mask') || p.name.toLowerCase().includes('mặt nạ') || p.name.toLowerCase().includes('pad'));
}

function renderLocalBrandProducts() {
    renderProductSection('localBrandGrid', p => ['DrCeutics', 'Cocoon', 'CLINICOS', 'Emmié by HappySkin', 'B.O.M', 'La Roche-Posay', 'Anessa'].includes(p.brand));
}

function renderSkinCareSectionProducts() {
    renderProductSection('skinCareSectionGrid', p => p.category.includes('skincare') || p.category.includes('cham-soc-da'));
}

function renderBodyCareSectionProducts() {
    renderProductSection('bodyCareSectionGrid', p => p.category.includes('bodycare') || p.category.includes('body'));
}

function renderHairCareProducts() {
    renderProductSection('hairCareGrid', p => p.category.includes('haircare') || p.category.includes('cham-soc-toc'));
}

function renderMakeupSectionProducts() {
    renderProductSection('makeupSectionGrid', p => p.category.startsWith('trang-diem'));
}

function updateHomeSectionCounts() {
    // Các nhãn giờ đây đã được cập nhật tự động trong renderProductSection
    // Hàm này có thể giữ lại làm rỗng hoặc xóa nếu không gọi ở nơi khác
}

function createProductCard(p, isFlashSale = false) {
    if (!p) return '';
    const progress = Math.min(100, Math.floor(((p.sold || 0) / 1000) * 100));
    
    // Đảm bảo cache được cập nhật nếu có data mới
    if (products.length > 0 && products.length > (JSON.parse(localStorage.getItem('qh_products_cache') || '[]')).length) {
        localStorage.setItem('qh_products_cache', JSON.stringify(products));
    }
    
    const price = (p.price || 0).toLocaleString();
    const oldPrice = p.oldPrice ? p.oldPrice.toLocaleString() : '';

    return `
        <div class="product-card" onclick="goToDetail('${p._id || p.id}')">
            ${isFlashSale ? `<div class="badge-discount">-${p.discount || '10%'}</div>` : ''}
            <div class="product-img-wrap">
                <img src="${p.image}" alt="${p.name}" referrerPolicy="no-referrer" onerror="this.src='https://placehold.co/400x400?text=Beauty+Product'">
                <button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart('${p._id || p.id}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                </button>
            </div>
            <p class="product-brand">${p.brand || 'Q&H'}</p>
            <h3 class="product-name">${p.name || 'Sản phẩm mới'}</h3>
            <div class="product-price-wrap">
                <span class="price-current" style="color: #007bff;">${price}đ</span>
                ${isFlashSale && oldPrice ? `<span class="price-old">${oldPrice}đ</span>` : ''}
            </div>
            ${isFlashSale ? `
                <div class="flash-progress">
                    <div class="progress-bar" style="width: ${progress}%"></div>
                    <div class="progress-text">Đã bán ${p.sold || 0}</div>
                </div>
            ` : ''}
        </div>
    `;
}

window.goToDetail = function(id) {
    // ⭐ LỚI LẦN 1 FIX: LẤY TỪ GLOBAL CACHE TRƯỚC
    const allProds = window.allProducts || products;
    const p = allProds.find(item => (item._id || item.id).toString() === id.toString());
    
    if (p) {
        localStorage.setItem('selectedProductId', p._id || p.id);
        localStorage.setItem('selectedProductName', p.name);
        localStorage.setItem('selectedProductImage', p.image);
        localStorage.setItem('selectedProductData', JSON.stringify(p));
        
        // ⭐ LỚI LẦN 1 FIX: CACHE TOÀN BỘ PRODUCTS ĐỂ TRỞ VỀ TRANG CHỦ CÓ DỮ LIỆU
        window.allProducts = allProds;
        localStorage.setItem('qh_products_cache', JSON.stringify(allProds));
        
        window.location.href = 'product-detail.html';
    } else {
        console.warn('Product not found:', id);
    }
};

// 5. CART LOGIC
window.addToCart = function(id, quantity) {
    // If quantity is not provided, check for qtyInput (for product detail page)
    if (quantity === undefined) {
        const qtyInput = document.getElementById('pdQty');
        quantity = qtyInput ? parseInt(qtyInput.value) : 1;
    }

    const product = products.find(p => (p._id || p.id).toString() === id.toString());
    if (!product) return;

    const existing = cart.find(item => (item._id || item.id).toString() === id.toString());

    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({ ...product, quantity: quantity });
    }

    localStorage.setItem('qh_cart', JSON.stringify(cart));
    updateCartUI();
    showToast('Đã thêm sản phẩm vào giỏ hàng!');
    openCart();
};

window.buyNow = function(productId) {
    if (!isLoggedIn) {
        showToast('Vui lòng đăng nhập để mua hàng!');
        const loginModal = document.getElementById('loginModalOverlay');
        if (loginModal) loginModal.classList.add('active');
        return;
    }
    // Lấy danh sách sản phẩm từ biến toàn cục hoặc localStorage
    const allProds = products.length > 0 ? products : (JSON.parse(localStorage.getItem('selectedProductData')) ? [JSON.parse(localStorage.getItem('selectedProductData'))] : []);
    const product = allProds.find(p => (p._id || p.id).toString() === productId.toString());
    
    if (!product) return;
    
    let qty = 1;
    const qtyInput = document.getElementById('pdQty');
    if (qtyInput) qty = parseInt(qtyInput.value);
    
    currentCheckoutItems = [{ ...product, quantity: qty }];
    isDirectCheckout = true;
    
    // Gắn lại sự kiện cho form trước khi mở overlay (để chắc chắn preventDefault hoạt động)
    window.initCheckoutListeners();
    
    renderCheckoutSummary();
    
    const checkoutOverlay = document.getElementById('checkoutOverlay');
    if (checkoutOverlay) { 
        checkoutOverlay.style.display = 'block';
        checkoutOverlay.classList.add('active');
        document.getElementById('checkoutForm').style.display = 'block';
    }
};

window.removeFromCart = function(id) {
    cart = cart.filter(item => (item._id || item.id).toString() !== id.toString());
    saveCart();
    updateCartUI();
};

/**
 * Thay đổi số lượng sản phẩm trong giỏ hàng (+/-)
 */
window.changeCartQty = function(id, delta) {
    const item = cart.find(i => (i._id || i.id).toString() === id.toString());
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            window.removeFromCart(id);
        } else {
            saveCart();
            updateCartUI();
        }
    }
};

function saveCart() {
    localStorage.setItem('qh_cart', JSON.stringify(cart));
}

function updateCartUI() {
    const badge = document.getElementById('cartBadge');
    const itemsList = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');

    const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0);
    badge.innerText = totalQty;

    if (itemsList) {
        itemsList.innerHTML = cart.map(item => `
            <div class="cart-item" style="display:flex; gap:15px; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:15px;">
                <img src="${item.image}" style="width:60px; height:60px; object-fit:contain; border-radius:4px;" referrerPolicy="no-referrer">
                <div style="flex:1;">
                    <p style="font-size:13px; font-weight:600; margin-bottom:5px;">${item.name}</p>
                    <p style="font-size:12px; color:#007bff; font-weight:800; margin-bottom: 8px;">${item.price.toLocaleString()}đ</p>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div class="qty-box" style="height:32px;">
                            <button style="width:30px; height:100%;" onclick="changeCartQty('${item._id || item.id}', -1)">-</button>
                            <input type="number" value="${item.quantity}" readonly style="width:35px; height:100%; font-size:12px; border-left:1px solid var(--border); border-right:1px solid var(--border);">
                            <button style="width:30px; height:100%;" onclick="changeCartQty('${item._id || item.id}', 1)">+</button>
                        </div>
                        <span style="font-size:11px; color:#999; cursor:pointer; text-decoration:underline;" onclick="removeFromCart('${item._id || item.id}')">Xóa</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    if (totalEl) totalEl.innerText = total.toLocaleString() + 'đ';
}

// 6. SLIDER
function startSlider() {
    const slides = document.querySelectorAll('.slide-item');
    if (slides.length === 0) return;
    setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, 4000);
}

// 7. COUNTDOWN
function startCountdown() {
    const target = new Date().getTime() + (3 * 60 * 60 * 1000); // 3h from now
    
    setInterval(() => {
        const now = new Date().getTime();
        const diff = target - now;

        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        const hEl = document.getElementById('hours');
        const mEl = document.getElementById('mins');
        const sEl = document.getElementById('secs');

        if (hEl) hEl.innerText = h.toString().padStart(2, '0');
        if (mEl) mEl.innerText = m.toString().padStart(2, '0');
        if (sEl) sEl.innerText = s.toString().padStart(2, '0');
    }, 1000);
}

// 8. EVENTS
function initEvents() {
    // 1. Mobile Menu Toggle
    const mobBtn = document.getElementById('mobileMenuBtn');
    const sideMenu = document.querySelector('.side-menu');
    if (mobBtn && sideMenu) {
        mobBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = sideMenu.style.display === 'block';
            sideMenu.style.display = isVisible ? 'none' : 'block';
            sideMenu.style.position = 'fixed';
            sideMenu.style.top = '70px';
            sideMenu.style.left = '0';
            sideMenu.style.width = '250px';
            sideMenu.style.height = '100vh';
            sideMenu.style.boxShadow = '5px 0 15px rgba(0,0,0,0.1)';
        });
    }

    // Sticky Header Logic
    const stickyHeader = document.getElementById('stickyHeader');
    if (stickyHeader) {
        let lastScrollTop = 0;
        window.addEventListener('scroll', () => {
            let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > lastScrollTop && scrollTop > 200) {
                stickyHeader.classList.add('header-hidden');
                stickyHeader.classList.remove('header-visible');
            } else {
                stickyHeader.classList.remove('header-hidden');
                stickyHeader.classList.add('header-visible');
            }
            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
        }, false);
    }

    // --- DÙNG EVENT DELEGATION CHO LOGIN/REGISTER ---
    document.addEventListener('submit', async (e) => {
        const target = e.target;
        
        // LOGIN FORM
        if (target.id === 'loginForm') {
            e.preventDefault();
            console.log("Q&H: Login form submitted");
            
            const submitBtn = target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Đang xử lý...';
            }

            const emailInput = target.querySelector('#loginUsername') || target.querySelector('input[type="text"]');
            const passInput = target.querySelector('#loginPassword') || target.querySelector('input[type="password"]');
            
            if (!emailInput || !passInput) {
                console.error("Q&H: Login inputs not found");
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Đăng nhập'; }
                return;
            }

            const email = emailInput.value.trim();
            const password = passInput.value;
            
            if (!email || !password) {
                showToast('Vui lòng nhập đầy đủ thông tin');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Đăng nhập'; }
                return;
            }
            
            try {
                console.log("Q&H: Sending login request to /api/users/login");
                const response = await fetch('/api/users/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                let data;
                try {
                    data = await response.json();
                } catch (e) {
                    console.error("Q&H: Failed to parse login response as JSON", e);
                    throw new Error(`Server trả về lỗi không xác định (${response.status})`);
                }

                if (!response.ok) {
                    console.warn("Q&H: Login rejected by server", data);
                    throw new Error(data.message || `Lỗi server (${response.status})`);
                }

                console.log("Q&H: Login success", data);
                handleAuthResponse(data, `Chào mừng ${data.name} đã trở lại!`);
            } catch (err) {
                console.error("Q&H: Login failure details:", err);
                showToast(err.message || 'Lỗi kết nối server');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = 'Đăng nhập';
                }
            }
        }

        // REGISTER FORM
        if (target.id === 'registerForm') {
            e.preventDefault();
            console.log("Q&H: Register form submitted");

            const submitBtn = target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Đang xử lý...';
            }

            const nameInput = target.querySelector('#regName') || target.querySelector('input[placeholder="Họ và tên"]');
            const emailInput = target.querySelector('#regEmail') || target.querySelector('input[type="email"]');
            const passInput = target.querySelector('#regPassword') || target.querySelector('input[type="password"]');
            const rePassInput = target.querySelector('#regRePassword');

            if (!nameInput || !emailInput || !passInput) {
                console.error("Q&H: Register inputs not found");
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Đăng ký'; }
                return;
            }

            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passInput.value;
            const rePassword = rePassInput ? rePassInput.value : password;

            if (!name || !email || !password) {
                showToast('Vui lòng nhập đầy đủ thông tin');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Đăng ký'; }
                return;
            }

            if (rePassInput && password !== rePassword) {
                showToast('Mật khẩu nhập lại không khớp!');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Đăng ký'; }
                return;
            }

            try {
                console.log("Q&H: Sending register request to /api/users");
                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || `Lỗi server (${response.status})`);
                }

                console.log("Q&H: Register success", data);
                handleAuthResponse(data, 'Đăng ký tài khoản thành công!');
            } catch (err) {
                console.error("Q&H: Register failure:", err);
                showToast(err.message || 'Lỗi kết nối server');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = 'Đăng ký';
                }
            }
        }
    });

    // Search Logic
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const searchBtn = document.querySelector('.search-btn');
    
    if (searchInput && searchResults) {
        const performSearch = () => {
            const q = searchInput.value.trim();
            if (q) window.location.href = `category.html?q=${encodeURIComponent(q)}`;
        };

        if (searchBtn) searchBtn.onclick = performSearch;
        searchInput.onkeydown = (e) => e.key === 'Enter' && performSearch();

        searchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase().trim();
            if (q.length < 1) { searchResults.style.display = 'none'; return; }
            const matches = products.filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).slice(0, 10);
            if (matches.length > 0) {
                searchResults.innerHTML = matches.map(p => `
                    <div class="search-result-item" onclick="goToDetail('${p._id || p.id}')">
                        <img src="${p.image}" alt="${p.name}">
                        <div class="search-result-info">
                            <div class="search-result-name">${p.name}</div>
                            <div class="search-result-price">${p.price.toLocaleString()}đ</div>
                        </div>
                    </div>
                `).join('');
                searchResults.style.display = 'block';
            } else {
                searchResults.innerHTML = '<div style="padding:15px;color:#999;text-align:center;">Không thấy sản phẩm</div>';
                searchResults.style.display = 'block';
            }
        };
    }

    // Modal Triggers
    const accountTrigger = document.getElementById('accountTrigger');
    if (accountTrigger) {
        accountTrigger.onclick = () => {
            if (isLoggedIn) {
                const profileOverlay = document.getElementById('profileOverlay');
                if (profileOverlay) {
                    profileOverlay.style.display = 'flex';
                    profileOverlay.classList.add('active');
                    if (window.switchProfileTab) window.switchProfileTab('info');
                }
            } else {
                const loginModal = document.getElementById('loginModalOverlay');
                if (loginModal) {
                    document.getElementById('loginView').style.display = 'block';
                    document.getElementById('registerView').style.display = 'none';
                    loginModal.classList.add('active');
                }
            }
        };
    }
}

    // PROFILE TAB LOGIC
    window.switchProfileTab = function(tabId) {
        // Update menu items
        const menuItems = document.querySelectorAll('.profile-menu-item');
        menuItems.forEach(item => {
            if (item.getAttribute('data-tab') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update tab panes
        const panes = document.querySelectorAll('.profile-tab-pane');
        panes.forEach(pane => {
            if (pane.id === 'tab-' + tabId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });

        // Special logic for orders
        if (tabId === 'orders') {
            renderProfileOrders();
        }
    };

    window.renderProfileOrders = async function(statusFilter = 'Chờ xác nhận') {
        const ordersList = document.getElementById('profileOrdersList');
        if (!ordersList) return;

        try {
            // Lấy đơn hàng thật từ Database dựa trên email
            const email = localStorage.getItem('qh_userEmail');
            const token = localStorage.getItem('qh_sessionToken');
            const response = await fetch(`/api/orders/myorders?email=${email}`, {
                headers: { 
                    'x-user-email': email,
                    'x-admin-token': token || ''
                }
            });
            
            if (!response.ok) throw new Error('Không thể tải đơn hàng');
            const orders = await response.json();
            
            const filteredOrders = orders.filter(o => (o.status || 'Chờ xác nhận') === statusFilter);

            if (filteredOrders.length === 0) {
                ordersList.innerHTML = '<div style="color: #888; text-align: center; padding: 60px 20px;">' +
                                    '<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="1.5" style="margin-bottom: 15px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>' +
                                    '<div style="font-size: 15px; font-weight: 500;">Bạn chưa có đơn hàng nào ở trạng thái này!</div>' +
                                    '</div>';
                return;
            }

            let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';
            filteredOrders.forEach(order => {
                const statusColor = order.status === 'Đã huỷ' ? '#e74c3c' : (order.status === 'Đã giao' ? '#27ae60' : '#f39c12');
                html += `
                    <div style="border: 1px solid #eee; border-radius: 8px; padding: 20px; background: #fff;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="font-weight: 700;">Đơn hàng #${order._id.substring(0,8)}</span>
                            <span style="color: ${statusColor}; font-weight: 700;">${order.status}</span>
                        </div>
                        ${order.items.map(item => `<div style="font-size: 13px;">${item.name} x${item.quantity}</div>`).join('')}
                <div style="text-align: right; margin-top: 10px; font-weight: 800; color: #007bff;">
                            Tổng: ${(order.totalPrice || 0).toLocaleString()}đ
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            ordersList.innerHTML = html;
        } catch (err) {
            ordersList.innerHTML = '<p style="text-align:center; padding: 20px;">Không thể tải đơn hàng.</p>';
        }
    };

    window.logoutUser = function() {
        console.log("Logging out user...");
        // Chỉ xóa các thông tin liên quan đến user/session, không xóa cache sản phẩm
        localStorage.removeItem('qh_userName');
        localStorage.removeItem('qh_userEmail');
        localStorage.removeItem('qh_userRole');
        localStorage.removeItem('qh_sessionToken');
        // Giữ lại qh_products_cache và qh_cart (nếu muốn giữ giỏ hàng cho khách)
        
        isLoggedIn = false;
        currentUserName = '';
        
        // Buộc load lại trang để đảm bảo state sạch hoàn toàn
        window.location.href = '/'; 
        setTimeout(() => window.location.reload(), 100);
    };

    // Global state sync
    initUserSession();

    window.switchOrderTab = function(el, status) {
        document.querySelectorAll('.order-tab').forEach(tab => tab.classList.remove('active'));
        el.classList.add('active');
        renderProfileOrders(status);
    };

    // ADMIN REDIRECT
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (adminPanelBtn) {
        adminPanelBtn.addEventListener('click', () => {
            window.location.href = 'admin.html';
        });
    }

    // WEB CONFIG & THEME
    function applyWebConfig() {
        const hotline = localStorage.getItem('qh_hotline') || '1900 636 510';
        const email = localStorage.getItem('qh_email') || 'contact@qhskinlab.com';
        
        const hHeader = document.getElementById('headerHotline');
        const hFooter = document.getElementById('footerHotline');
        const eFooter = document.getElementById('footerEmail');

        if (hHeader) hHeader.textContent = `Hotline: ${hotline}`;
        if (hFooter) hFooter.textContent = hotline;
        if (eFooter) eFooter.textContent = email;
    }

    function applyTheme(theme) {
        document.body.className = '';
        if (theme !== 'default') {
            document.body.classList.add(theme);
        }
    }

    applyWebConfig();
    applyTheme(localStorage.getItem('qh_theme') || 'default');

    // CHECKOUT LOGIC
    const checkoutOverlay = document.getElementById('checkoutOverlay');
    const closeCheckoutBtn = document.getElementById('closeCheckoutBtn');
    const checkoutForm = document.getElementById('checkoutForm');
    const checkoutSummaryItems = document.getElementById('checkoutSummaryItems');
    const checkoutSubtotal = document.getElementById('checkoutSubtotal');
    const checkoutTotal = document.getElementById('checkoutTotal');

    const mainCheckoutBtn = document.getElementById('checkoutBtn');
    if (mainCheckoutBtn) {
        mainCheckoutBtn.addEventListener('click', () => {
            if (!isLoggedIn) {
                showToast('Vui lòng đăng nhập để tiến hành đặt hàng!');
                const loginModal = document.getElementById('loginModalOverlay');
                if (loginModal) {
                    loginModal.classList.add('active');
                }
                return;
            }

            if (cart.length === 0) {
                showToast('Giỏ hàng của bạn đang trống!');
                return;
            }
            
            const hasMockProduct = cart.some(item => {
                const id = (item._id || item.id || "").toString();
                return false; // Cho phép thanh toán cả hàng mock để bạn test dễ dàng
            });

            if (hasMockProduct) {
                showToast('Giỏ hàng chứa sản phẩm mẫu. Vui lòng xóa và chọn sản phẩm từ hệ thống!');
                return;
            }

            currentCheckoutItems = [...cart];
            isDirectCheckout = false;
            closeCart();
            renderCheckoutSummary();
            checkoutOverlay.style.display = 'block';
            checkoutOverlay.classList.add('active');
            const successEl = document.getElementById('checkoutSuccess');
            const qrEl = document.getElementById('checkoutQR');
            if (successEl) successEl.style.display = 'none';
            if (qrEl) qrEl.style.display = 'none';
            if (checkoutForm) checkoutForm.style.display = 'block';
        });
    }

    // Đã đưa ra ngoài scope của initEvents để gọi được từ injectRequiredElements
    window.initCheckoutListeners = function() {
        const checkoutForm = document.getElementById('checkoutForm');
        const closeCheckoutBtn = document.getElementById('closeCheckoutBtn');
        const checkoutOverlay = document.getElementById('checkoutOverlay');

        if (closeCheckoutBtn && checkoutOverlay) {
            closeCheckoutBtn.onclick = () => {
                checkoutOverlay.classList.remove('active');
                checkoutOverlay.style.display = 'none';
            };
        }

        if (checkoutForm) {
            // Remove previous event listener if any to avoid duplicates
            const newForm = checkoutForm.cloneNode(true);
            checkoutForm.parentNode.replaceChild(newForm, checkoutForm);
            
            newForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const name = document.getElementById('orderName').value;
                const phone = document.getElementById('orderPhone').value;
                const email = document.getElementById('orderEmail').value;
                const address = document.getElementById('orderAddress').value;
                const note = document.getElementById('orderNote').value;
                const payment = document.getElementById('orderPaymentMethod').value;
                const total = currentCheckoutItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                const userEmail = localStorage.getItem('qh_userEmail');

                try {
                    const token = localStorage.getItem('qh_sessionToken');
                    const response = await fetch('/api/orders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-email': userEmail || '',
                            'x-admin-token': token || ''
                        },
                        body: JSON.stringify({
                            customerInfo: { name, phone, email, address, note },
                            items: currentCheckoutItems.map(i => ({
                                product: i._id || i.id,
                                name: i.name,
                                quantity: i.quantity,
                                price: i.price
                            })),
                            paymentMethod: payment,
                            totalPrice: total
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.message || 'Lỗi khi đặt hàng');
                    }
                    
                    const orderData = await response.json();
                    const order = orderData.order || orderData;

                    if (!isDirectCheckout) {
                        cart = [];
                        localStorage.setItem('qh_cart', JSON.stringify(cart));
                        updateCartUI();
                    }
                    
                    if (isLoggedIn) {
                        renderProfileOrders();
                    }

                    const checkoutSuccess = document.getElementById('checkoutSuccess');
                    const checkoutQR = document.getElementById('checkoutQR');
                    if (checkoutSuccess) {
                        newForm.style.display = 'none';
                        if (checkoutQR) checkoutQR.style.display = 'none';
                        checkoutSuccess.style.display = 'block';
                        
                        const orderId = order.id || order._id || "N/A";
                        const successOrderId = document.getElementById('successOrderId');
                        if (successOrderId) successOrderId.textContent = '#' + orderId.toString().toUpperCase().substring(0,8);
                        
                        const successOrderTotal = document.getElementById('successOrderTotal');
                        if (successOrderTotal && order.totalPrice) successOrderTotal.textContent = order.totalPrice.toLocaleString() + 'đ';
                        
                        const successOrderItems = document.getElementById('successOrderItems');
                        if (successOrderItems && order.items) {
                            successOrderItems.innerHTML = order.items.map(item => `
                                <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:14px;">
                                    <span>${item.name} x${item.quantity}</span>
                                    <span>${(item.price * item.quantity).toLocaleString()}đ</span>
                                </div>
                            `).join('');
                        }
                    } else {
                        showToast('Đặt hàng thành công!');
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                    }

                    if (payment === 'BANK') {
                        const realOrderId = orderData.orderId || (orderData.order ? orderData.order._id || orderData.order.id : orderData._id);
                        const realOrderCode = realOrderId.toString().substring(0,8);
                        const qrView = document.getElementById('checkoutQR');
                        const qrCodeImg = document.getElementById('qrCodeImg');
                        const qrAmount = document.getElementById('qrAmount');
                        const qrNote = document.getElementById('qrNote');
                        const confirmQRBtn = document.getElementById('confirmQRBtn');

                        if (qrView) {
                            newForm.style.display = 'none';
                            qrView.style.display = 'block';
                            
                            if (qrAmount) qrAmount.textContent = response.order.totalPrice.toLocaleString() + 'đ';
                            if (qrNote) qrNote.textContent = 'QH' + realOrderCode;
                            if (qrCodeImg) {
                                const amount = response.order.totalPrice;
                                qrCodeImg.src = `https://api.vietqr.io/image/vietcombank/0011004123456/qr_only.jpg?amount=${amount}&addInfo=QH${realOrderCode}&accountName=NGUYEN THI THANH HIEN`;
                            }

                            confirmQRBtn.onclick = () => finalizeOrderUI(response);
                        } else {
                            finalizeOrderUI(response);
                        }
                    } else {
                        finalizeOrderUI(response);
                    }
                } catch (err) {
                    showToast('Lỗi: ' + err.message);
                }
            });
        }
    };

    // Global click listener for overlays
    window.onclick = (e) => {
        const loginModal = document.getElementById('loginModalOverlay');
        const cartDrawer = document.getElementById('cartDrawer');
        const checkoutOverlay = document.getElementById('checkoutOverlay');
        const profileOverlay = document.getElementById('profileOverlay');

        if (loginModal && e.target === loginModal) loginModal.classList.remove('active');
        if (cartDrawer && e.target === cartDrawer) cartDrawer.classList.remove('active');
        if (checkoutOverlay && e.target === checkoutOverlay) checkoutOverlay.classList.remove('active');
        if (profileOverlay && e.target === profileOverlay) {
            profileOverlay.classList.remove('active');
            profileOverlay.style.display = 'none';
        }
    };

    const adminBtn = document.getElementById('adminPanelBtn');
    if (adminBtn) {
        adminBtn.onclick = () => window.location.href = 'admin.html';
    }

    // Kích hoạt nút Mua ngay trên trang chi tiết sản phẩm
    const buyNowBtn = document.querySelector('.btn-buy-now');
    if (buyNowBtn) {
        buyNowBtn.onclick = () => {
            const productId = localStorage.getItem('selectedProductId');
            if (productId) window.buyNow(productId);
        };
    }

    // Gắn sự kiện cho nút Thanh toán trong giỏ hàng
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (!isLoggedIn) {
                showToast('Vui lòng đăng nhập để thực hiện thanh toán!');
                const loginModal = document.getElementById('loginModalOverlay');
                if (loginModal) loginModal.classList.add('active');
                return;
            }
            if (cart.length === 0) {
                showToast('Giỏ hàng của bạn đang trống!');
                return;
            }
            currentCheckoutItems = [...cart];
            isDirectCheckout = false;
            closeCart();
            renderCheckoutSummary();
            const checkoutOverlay = document.getElementById('checkoutOverlay');
            if (checkoutOverlay) {
                checkoutOverlay.style.display = 'block';
                checkoutOverlay.classList.add('active');
                document.getElementById('checkoutForm').style.display = 'block';
                document.getElementById('checkoutSuccess').style.display = 'none';
                document.getElementById('checkoutQR').style.display = 'none';
            }
        });
    }

/**
 * Hàm xử lý dữ liệu sau khi đăng nhập hoặc đăng ký thành công
 */
function handleAuthResponse(data, successMsg) {
    // 1. Lưu thông tin vào localStorage
    localStorage.setItem('qh_userName', data.name);
    localStorage.setItem('qh_userEmail', data.email);
    localStorage.setItem('qh_userRole', data.role);
    if (data.token) localStorage.setItem('qh_sessionToken', data.token);
    
    // 2. Sync UI immediately
    initUserSession();
    showToast(successMsg);
    
    // 3. Close modal
    const loginModal = document.getElementById('loginModalOverlay');
    if (loginModal) loginModal.classList.remove('active');
}

function renderCheckoutSummary() {
    const checkoutSummaryItems = document.getElementById('checkoutSummaryItems');
    const checkoutSubtotal = document.getElementById('checkoutSubtotal');
    const checkoutTotal = document.getElementById('checkoutTotal');

    if (!checkoutSummaryItems) return;
    
    checkoutSummaryItems.innerHTML = currentCheckoutItems.map(item => `
        <div style="display: flex; gap: 15px; margin-bottom: 20px; align-items: center;">
            <div style="width: 60px; height: 60px; border: 1px solid #eee; border-radius: 4px; overflow: hidden; flex-shrink: 0;">
                <img src="${item.image}" style="width: 100%; height: 100%; object-fit: cover;" referrerPolicy="no-referrer">
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 700; font-size: 14px; color: #333; margin-bottom: 4px; line-height: 1.4;">${item.name}</div>
                <div style="font-size: 13px; color: #666;">Số lượng: ${item.quantity}</div>
            </div>
            <div style="font-weight: 800; font-size: 15px; color: #007bff;">${(item.price * item.quantity).toLocaleString()}đ</div>
        </div>
    `).join('');

    const total = currentCheckoutItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    if (checkoutSubtotal) checkoutSubtotal.textContent = total.toLocaleString() + 'đ';
    if (checkoutTotal) checkoutTotal.textContent = total.toLocaleString() + 'đ';
}

// --- BỔ SUNG CÁC TÍNH NĂNG CÒN THIẾU ---

// 1. Theo dõi sản phẩm đã xem
window.trackProductView = function(productId) {
    let viewed = JSON.parse(localStorage.getItem('qh_viewed')) || [];
    // Loại bỏ nếu đã tồn tại và đưa lên đầu
    viewed = viewed.filter(id => id !== productId);
    viewed.unshift(productId);
    // Chỉ giữ lại 10 sản phẩm gần nhất
    localStorage.setItem('qh_viewed', JSON.stringify(viewed.slice(0, 10)));
};

// 2. Gợi ý sản phẩm liên quan
window.renderRelatedProducts = function(currentProduct) {
    const grid = document.getElementById('relatedProductsGrid');
    if (!grid) return;

    const related = products
        .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
        .slice(0, 4);

    if (related.length > 0) {
        grid.innerHTML = related.map(p => createProductCard(p)).join('');
    } else {
        grid.innerHTML = '<p style="grid-column: span 4; text-align: center; color: #999;">Không có sản phẩm liên quan.</p>';
    }
};

// 3. Hiển thị đánh giá (Mock data)
window.renderReviews = function(productId) {
    const container = document.querySelector('.reviews-list');
    if (!container) return;

    // Giả lập dữ liệu đánh giá
    const mockReviews = [
        { user: "Nguyễn An", rating: 5, date: "10/04/2026", content: "Sản phẩm dùng rất thích, đóng gói cẩn thận." },
        { user: "Trần Bình", rating: 4, date: "08/04/2026", content: "Giao hàng hơi chậm một chút nhưng chất lượng ok." }
    ];

    container.innerHTML = mockReviews.map(r => `
        <div class="review-item">
            <div class="review-header">
                <div class="user-info">
                    <span class="username">${r.user}</span>
                    <span class="review-date">${r.date}</span>
                </div>
                <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
            </div>
            <p class="review-text">${r.content}</p>
            <div class="shop-response">
                <div class="shop-name">Q&H SKINLAB phản hồi:</div>
                <p class="shop-text">Cảm ơn bạn đã tin tưởng ủng hộ shop ạ!</p>
            </div>
        </div>
    `).join('');
};

// 4. Cung cấp hàm getProducts cho các trang con
// Hàm getProducts đã được định nghĩa ở trên (thay thế bản này để tránh override)

// 5. Tính năng Yêu thích (Wishlist)
window.toggleFavorite = function(id) {
    let favorites = JSON.parse(localStorage.getItem('qh_favorites')) || [];
    if (favorites.includes(id)) {
        favorites = favorites.filter(fid => fid !== id);
        showToast('Đã xóa khỏi danh sách yêu thích');
    } else {
        favorites.push(id);
        showToast('Đã thêm vào danh sách yêu thích');
    }
    localStorage.setItem('qh_favorites', JSON.stringify(favorites));
};

function openCart() { 
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.classList.add('active'); 
}
function closeCart() { 
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.classList.remove('active'); 
}

function showToast(msg) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <span>${msg}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function attachModalListeners() {
    const toRegister = document.getElementById('toRegister');
    const toLogin = document.getElementById('toLogin');
    const loginView = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');
    const loginModal = document.getElementById('loginModalOverlay');
    const closeLogin = document.getElementById('closeLogin');

    if (closeLogin && loginModal) {
        closeLogin.onclick = () => {
            console.log("Q&H: Closing Login Modal");
            loginModal.classList.remove('active');
        };
    }

    if (toRegister && loginView && registerView) {
        toRegister.onclick = () => {
            console.log("Q&H: Switching to Register View");
            loginView.style.display = 'none';
            registerView.style.display = 'block';
        };
    }
    if (toLogin && loginView && registerView) {
        toLogin.onclick = () => {
            console.log("Q&H: Switching to Login View");
            loginView.style.display = 'block';
            registerView.style.display = 'none';
        };
    }
    if (loginModal) {
        loginModal.onclick = (e) => {
            if (e.target === loginModal) loginModal.classList.remove('active');
        };
    }
}

// --- MULTI-PAGE COMPATIBILITY: INJECT MODALS ---
function injectRequiredElements() {
    // Kiểm tra và thêm Login Modal nếu chưa có
    if (!document.getElementById('loginModalOverlay')) {
        const modalHtml = `
            <div class="modal-overlay" id="loginModalOverlay">
                <div class="login-modal">
                    <span class="close-modal" id="closeLogin">&times;</span>
                    <div id="loginView">
                        <h2>Đăng nhập</h2>
                        <form class="login-form" id="loginForm">
                            <input type="text" id="loginUsername" placeholder="Email hoặc Tên đăng nhập" required>
                            <input type="password" id="loginPassword" placeholder="Mật khẩu" required>
                            <button type="submit" class="btn-login">Đăng nhập</button>
                        </form>
                        <div class="register-section">
                            <p>Chưa có tài khoản?</p>
                            <button type="button" class="btn-register" id="toRegister">Đăng ký ngay</button>
                        </div>
                    </div>

                    <!-- Register View -->
                    <div id="registerView" style="display: none;">
                        <h2>Đăng ký</h2>
                        <form class="login-form" id="registerForm">
                            <input type="text" id="regName" placeholder="Họ và tên" required>
                            <input type="email" id="regEmail" placeholder="Email" required>
                            <input type="password" id="regPassword" placeholder="Mật khẩu" required>
                            <input type="password" id="regRePassword" placeholder="Nhập lại mật khẩu" required>
                            <button type="submit" class="btn-login">Đăng ký</button>
                        </form>
                        <div class="register-section">
                            <p>Đã có tài khoản?</p>
                            <button type="button" class="btn-register" id="toLogin">Đăng nhập</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    // Luôn gắn lại sự kiện cho login/register modal (dù là mới inject hay đã có sẵn trong HTML)
    attachModalListeners();
    
    // Kiểm tra và thêm Profile Overlay nếu chưa có
    if (!document.getElementById('profileOverlay')) {
        const profileHtml = `
            <div class="admin-overlay" id="profileOverlay" style="z-index: 12000; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center;">
                <div style="width: 1000px; height: 600px; background: white; border-radius: 8px; display: flex; overflow: hidden; position: relative;">
                    <button onclick="document.getElementById('profileOverlay').style.display='none';" style="position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                    <div style="width: 250px; background: #fafafa; border-right: 1px solid #eee; padding: 30px 0;">
                        <div style="padding: 0 25px 30px; border-bottom: 1px solid #eee; text-align: center;">
                            <div id="profileAvatar" style="width: 50px; height: 50px; background: var(--red); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-weight: 700;">NH</div>
                            <div id="profileUserName" style="font-weight: 700;">User</div>
                            <div id="profileUserEmail" style="font-size: 12px; color: #888;">user@email.com</div>
                        </div>
                        <div class="profile-menu-item active" data-tab="info" onclick="switchProfileTab('info')" style="padding: 12px 25px; cursor: pointer;">Thông tin</div>
                        <div class="profile-menu-item" data-tab="orders" onclick="switchProfileTab('orders')" style="padding: 12px 25px; cursor: pointer;">Đơn hàng</div>
                        <div class="profile-menu-item logout" onclick="logoutUser()" style="padding: 12px 25px; cursor: pointer; margin-top: 20px;">Đăng xuất</div>
                    </div>
                    <div style="flex: 1; padding: 40px; overflow-y: auto;">
                        <div id="tab-info" class="profile-tab-pane active">
                            <h3>Thông tin cá nhân</h3>
                            <p id="infoName">Chưa cập nhật</p>
                            <p id="infoEmail">Chưa cập nhật</p>
                        </div>
                        <div id="tab-orders" class="profile-tab-pane" style="display: none;">
                            <h3>Đơn hàng của bạn</h3>
                            <div id="profileOrdersList">Chưa có đơn hàng</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', profileHtml);
    }

    // Kiểm tra và thêm Checkout Overlay nếu chưa có (Để nút Mua ngay ở trang chi tiết hoạt động)
    if (!document.getElementById('checkoutOverlay')) {
        const checkoutHtml = `
            <div class="admin-overlay" id="checkoutOverlay" style="z-index: 11000; background: #f4f4f4; display:none;">
                <div style="background: white; padding: 15px 5%; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd; position: sticky; top: 0; z-index: 100;">
                    <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -1px; margin: 0; cursor: pointer;" onclick="const o = document.getElementById('checkoutOverlay'); o.classList.remove('active'); o.style.display='none';">Q&H SKINLAB</h1>
                    <button id="closeCheckoutBtn" style="background: none; border: none; cursor: pointer; font-size: 24px;" onclick="const o = document.getElementById('checkoutOverlay'); o.classList.remove('active'); o.style.display='none';">&times;</button>
                </div>
                <div class="container" style="max-width: 1100px; margin: 40px auto; display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 30px;">
                    <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                        <h2 style="margin-bottom: 20px;">Thông tin giao hàng</h2>
                        <form id="checkoutForm">
                            <div style="margin-bottom: 15px;">
                                <label style="display:block; margin-bottom:5px; font-weight:700;">Họ và tên</label>
                                <input type="text" id="orderName" required style="width:100%; padding:10px; border:1px solid #eee;">
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                                <div>
                                    <label style="display:block; margin-bottom:5px; font-weight:700;">Số điện thoại</label>
                                    <input type="tel" id="orderPhone" required style="width:100%; padding:10px; border:1px solid #eee;">
                                </div>
                                <div>
                                    <label style="display:block; margin-bottom:5px; font-weight:700;">Email</label>
                                    <input type="email" id="orderEmail" required style="width:100%; padding:10px; border:1px solid #eee;">
                                </div>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <label style="display:block; margin-bottom:5px; font-weight:700;">Địa chỉ</label>
                                <textarea id="orderAddress" required style="width:100%; padding:10px; border:1px solid #eee;"></textarea>
                            </div>
                            <div style="margin-bottom: 15px;">
                                <label style="display:block; margin-bottom:5px; font-weight:700;">Thanh toán</label>
                                <select id="orderPaymentMethod" style="width:100%; padding:10px; border:1px solid #eee;">
                                    <option value="COD">Thanh toán khi nhận hàng (COD)</option>
                                    <option value="BANK">Chuyển khoản ngân hàng</option>
                                </select>
                            </div>
                            <textarea id="orderNote" placeholder="Ghi chú (tùy chọn)" style="width:100%; padding:10px; border:1px solid #eee; margin-bottom:20px;"></textarea>
                            <button type="submit" style="width:100%; padding:15px; background:#5dade2; color:white; border:none; font-weight:800; cursor:pointer; text-transform:uppercase;">HOÀN TẤT ĐẶT HÀNG</button>
                        </form>
                        <div id="checkoutQR" style="display:none; text-align:center; padding: 20px 0;">
                            <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 20px; color: #333;">THANH TOÁN CHUYỂN KHOẢN</h2>
                            <p style="color: #666; margin-bottom: 20px; font-size: 14px;">Vui lòng quét mã QR bên dưới để thanh toán đơn hàng.</p>
                            
                            <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: inline-block; margin-bottom: 20px;">
                                <img id="qrCodeImg" src="" alt="QR Code" style="width: 250px; height: 250px; object-fit: contain; margin-bottom: 15px;">
                                <div style="text-align: left; font-size: 14px; line-height: 1.6;">
                                    <p><strong>Chủ tài khoản:</strong> Nguyễn Thị Thanh Hiền</p>
                                    <p><strong>Số tài khoản:</strong> 1234567890</p>
                                    <p><strong>Ngân hàng:</strong> Vietcombank</p>
                                    <p><strong>Số tiền:</strong> <span id="qrAmount" style="color: #007bff; font-weight: 800;">0đ</span></p>
                                    <p><strong>Nội dung:</strong> <span id="qrNote" style="color: var(--primary); font-weight: 700;">QH123456</span></p>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 15px; justify-content: center;">
                                <button id="confirmQRBtn" style="padding: 12px 25px; background: var(--primary); color: white; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">XÁC NHẬN ĐÃ CHUYỂN</button>
                            </div>
                        </div>
                        <div id="checkoutSuccess" style="display:none; text-align:center; padding:20px;">
                            <h2 style="color:var(--primary);">ĐẶT HÀNG THÀNH CÔNG!</h2>
                            <p>Mã đơn hàng: <strong id="successOrderId"></strong></p>
                            <p>Số tiền thanh toán: <strong id="successOrderTotal" style="color: #007bff;">0đ</strong></p>
                            <div id="successOrderItems" style="margin-top:15px; text-align:left; border-top:1px solid #eee; padding-top:10px;"></div>
                            <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; cursor:pointer;">TIẾP TỤC MUA SẮM</button>
                        </div>
                    </div>
                    <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); height:fit-content;">
                        <h2 style="margin-bottom: 20px;">Đơn hàng của bạn</h2>
                        <div id="checkoutSummaryItems"></div>
                        <div style="border-top:1px solid #eee; padding-top:15px; margin-top:15px;">
                            <div class="flex-between" style="font-weight:800; color:#007bff; font-size:20px;">
                                <span>TỔNG CỘNG:</span>
                                <span id="checkoutTotal">0đ</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', checkoutHtml);
    }
    
    // Kiểm tra và thêm Toast Container nếu chưa có
    if (!document.getElementById('toastContainer')) {
        const toastHtml = `<div id="toastContainer" class="toast-container"></div>`;
        document.body.insertAdjacentHTML('beforeend', toastHtml);
    }
}


