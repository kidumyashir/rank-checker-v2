const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SERP_API_KEY = process.env.SERP_API_KEY || 'f09191e9529ac5c8524214e0fe7f5a79dbf754f912330921b57829c6b2fc6ff5';

app.use(cors());
app.use(express.json());

const domainsFilePath = path.join(__dirname, 'domains.json');

// פונקציית ניקוי דומיין אחידה
function cleanDomain(domain) {
    return domain
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .replace(/^\.+/, '')
        .replace(/\s+/g, '')
        .trim();
}

// טוען את קובץ ה-json אם קיים, אחרת יוצר חדש
const loadDomains = () => {
    if (!fs.existsSync(domainsFilePath)) {
        fs.writeFileSync(domainsFilePath, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(domainsFilePath, 'utf8'));
};

// שומר את הנתונים
const saveDomains = (domains) => {
    fs.writeFileSync(domainsFilePath, JSON.stringify(domains, null, 2));
};

// יצירת דומיין חדש
app.post('/add-domain', (req, res) => {
    let { domain } = req.body;
    if (!domain) {
        return res.status(400).json({ error: "חובה לציין דומיין" });
    }

    domain = cleanDomain(domain);
    const data = loadDomains();
    if (!data[domain]) {
        data[domain] = {};
        saveDomains(data);
    }
    res.json({ success: true });
});

// הוספת ביטוי חדש לדומיין
app.post('/add-keyword', (req, res) => {
    let { domain, keyword } = req.body;
    if (!domain || !keyword) {
        return res.status(400).json({ error: "חובה דומיין וביטוי" });
    }
    domain = cleanDomain(domain);
    const data = loadDomains();
    if (!data[domain]) {
        data[domain] = {};
    }
    if (!data[domain][keyword]) {
        data[domain][keyword] = [];
    }
    saveDomains(data);
    res.json({ success: true });
});

// פונקציה לבדיקה לכל מכשיר
async function checkPosition(domain, keyword, device) {
    for (let page = 1; page <= 2; page++) {
        const params = {
            engine: 'google',
            q: keyword,
            gl: 'il',
            hl: 'he',
            api_key: SERP_API_KEY,
            device: device,
            start: (page - 1) * 10
        };
        const response = await axios.get('https://serpapi.com/search', { params });
        const serpResults = response.data.organic_results;
        const indexInPage = serpResults.findIndex(result => result.link.includes(domain));
        if (indexInPage >= 0) {
            return (page - 1) * 10 + indexInPage + 1;
        }
    }
    return null; // לא נמצא
}

// בדיקת מיקומים לכל הדומיין
app.post('/check-rank', async (req, res) => {
    let { domain } = req.body;
    domain = cleanDomain(domain);
    const data = loadDomains();

    if (!data[domain]) {
        return res.status(404).json({ error: "הדומיין לא נמצא" });
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        const results = [];

        for (let keyword of Object.keys(data[domain])) {
            const desktopPos = await checkPosition(domain, keyword, 'desktop');
            const mobilePos = await checkPosition(domain, keyword, 'mobile');

            const record = {
                date: today,
                desktop: desktopPos,
                mobile: mobilePos
            };

            data[domain][keyword].push(record);
            results.push({
                keyword,
                desktop: desktopPos !== null ? `מיקום ${desktopPos}` : "לא נמצא",
                mobile: mobilePos !== null ? `מיקום ${mobilePos}` : "לא נמצא"
            });
        }

        saveDomains(data);
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// החזרת רשימת הדומיינים
app.get('/domains', (req, res) => {
    const data = loadDomains();
    res.json(Object.keys(data));
});

// החזרת ביטויים של דומיין
app.get('/domains/:domain', (req, res) => {
    const data = loadDomains();
    const domain = cleanDomain(req.params.domain);
    res.json(Object.keys(data[domain] || {}));
});

// החזרת היסטוריית מיקומים של ביטוי
app.get('/domains/:domain/:keyword', (req, res) => {
    const data = loadDomains();
    const domain = cleanDomain(req.params.domain);
    const keyword = req.params.keyword;
    res.json(data[domain]?.[keyword] || []);
});

// מחיקת דומיין
app.delete('/delete-domain/:domain', (req, res) => {
    const data = loadDomains();
    const domain = cleanDomain(req.params.domain);

    if (!data[domain]) {
        return res.status(404).json({ error: "הדומיין לא נמצא" });
    }

    delete data[domain];
    saveDomains(data);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🔥 V2 השרת רץ על פורט ${PORT}`);
});
