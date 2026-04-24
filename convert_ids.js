const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const files = ['products.json', 'categories.json', 'users.json', 'orders.json', 'magazine.json'];

files.forEach(file => {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (Array.isArray(data)) {
                data.forEach(item => {
                    if (item.id !== undefined) item.id = item.id.toString();
                    if (item._id !== undefined) item._id = item._id.toString();
                    // Fix potential nested stuff if any
                    if (item.items && Array.isArray(item.items)) {
                        item.items.forEach(sub => {
                            if (sub.id !== undefined) sub.id = sub.id.toString();
                            if (sub._id !== undefined) sub._id = sub._id.toString();
                            if (sub.product !== undefined) sub.product = sub.product.toString();
                        });
                    }
                });
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`Converted IDs in ${file} to strings.`);
            }
        } catch (e) {
            console.error(`Error processing ${file}:`, e);
        }
    }
});
