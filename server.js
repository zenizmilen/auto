// ===== SERVIDOR AUTO-JOINER V3.0 - TIMEOUT MELHORADO =====
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== WEBHOOKS DO DISCORD =====
const WEBHOOKS = {
    free: "https://discord.com/api/webhooks/1451031458612252704/Oo1K9KNcTSRbRFcSTlveMyNnMA2DOKFATnYKSI8Q-RvMBPI5ZnqF0dRkjKgGHq7o5c1D",
    basico: "https://discord.com/api/webhooks/1449966669005848668/QAjwTBI7Erv6mZr5hTvsX3Ctgwofoboj7bZZot4v02f6TiGQJustRdsd_ax0vgCo9NTU",
    highlight: "https://discord.com/api/webhooks/1451031692927041678/Pwu3TLXC61aPFcXkz7xnz8P0hoq_vyI2z2-f9t6nSqQ5ncM7A4JsbplrBiDCMjDOKGTl",
    premium: "https://discord.com/api/webhooks/1451031769687134292/ZCdEm84p2TJPAztbpFUc0ovMRS8l97D9ZX9_70zBKCGHY_xufru7yySP5oyqRxpzmkBj",
    essencial: "https://discord.com/api/webhooks/1450158161959850086/E8uoVdUtw6qYnUi57zJEbAADvQ5OFXUdMGkR1cPu3934jA-Gm3jCvdbbEJhBbDROLHIf"
};

// ===== CONFIGURAÇÃO =====
const JOB_TIMEOUT = 15000; // 15 segundos
const DUPLICATE_WINDOW = 60000; // 1 minuto para considerar duplicado

// ===== LOGS DETALHADOS =====
let requestLog = [];
const MAX_LOGS = 50;

function addLog(type, message, data = null) {
    const log = {
        time: new Date().toISOString(),
        type,
        message,
        data
    };
    requestLog.unshift(log);
    if (requestLog.length > MAX_LOGS) requestLog.pop();
    
    const emoji = {
        'success': '✅',
        'error': '❌',
        'info': 'ℹ️',
        'warning': '⚠️'
    }[type] || '📝';
    
    console.log(`${emoji} [${new Date().toLocaleTimeString()}] ${message}`);
    if (data) console.log('   Dados:', JSON.stringify(data, null, 2));
}

app.use((req, res, next) => {
    addLog('info', `Requisição: ${req.method} ${req.path}`, {
        headers: req.headers,
        ip: req.ip
    });
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ===== ARMAZENAMENTO =====
let jobQueue = [];
let stats = {
    totalReceived: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalExpired: 0,
    lastUpdate: null,
    startTime: new Date().toISOString(),
    byWebhook: {
        free: 0,
        basico: 0,
        highlight: 0,
        premium: 0,
        essencial: 0
    }
};

// ===== PARSE WEBHOOK DO DISCORD =====
function parseWebhook(body) {
    addLog('info', 'Tentando parsear webhook');
    
    try {
        const embeds = body.embeds || [];
        addLog('info', `Encontrados ${embeds.length} embeds`);
        
        if (embeds.length === 0) {
            addLog('warning', 'Nenhum embed encontrado');
            return null;
        }
        
        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            
            let name = 'Brainrot';
            let value = '0';
            
            if (embed.title) {
                let titleClean = embed.title.replace(/[🔥💎⭐🚨☯️]/g, '').trim();
                const titleValueMatch = titleClean.match(/\$([0-9.]+[KMBT]?\/s)/i);
                if (titleValueMatch) {
                    value = titleValueMatch[1];
                    name = titleClean.replace(/\$[0-9.]+[KMBT]?\/s/i, '').trim();
                } else {
                    name = titleClean;
                }
            }
            
            let jobId = null;
            let players = 'N/A';
            
            if (embed.fields && Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                    // Job ID
                    if (field.name && (field.name.includes('Job ID') || field.name.includes('🌐'))) {
                        const jobMatch = field.value.match(/[`]*([a-f0-9\-]{36})[`]*/);
                        if (jobMatch) {
                            jobId = jobMatch[1];
                            addLog('success', '🔑 Job ID extraído', { jobId });
                        }
                    }
                    
                    // Valor
                    if (field.name && (field.name.includes('Valor') || field.name.includes('💰'))) {
                        const cleanValue = field.value.replace(/\*\*/g, '').replace(/\$/g, '').trim();
                        const valMatch = cleanValue.match(/([0-9.]+[KMBT]?\/s)/i);
                        if (valMatch) {
                            value = valMatch[1];
                            addLog('success', '💰 Valor extraído', { value });
                        }
                    }
                    
                    // Players
                    if (field.name && (field.name.includes('Players') || field.name.includes('👥'))) {
                        const playMatch = field.value.match(/(\d+)\/(\d+)/);
                        if (playMatch) {
                            players = `${playMatch[1]}/${playMatch[2]}`;
                        }
                    }
                }
            }
            
            if (value === '0' && embed.description) {
                const descValueMatch = embed.description.match(/\$?([0-9.]+[KMBT]?\/s)/i);
                if (descValueMatch) {
                    value = descValueMatch[1];
                }
            }
            
            // ✅ ACEITA JOBS SEM JOB ID (para Highlight)
            if (jobId || name !== 'Brainrot') {
                addLog('success', '✅ Job parseado', { 
                    jobId: jobId || 'N/A', 
                    name, 
                    players, 
                    value 
                });
                return { jobId: jobId || null, name, players, value, time: Date.now() };
            }
        }
        
        addLog('error', 'Nenhum job válido encontrado');
        return null;
    } catch (e) {
        addLog('error', 'Erro ao parsear webhook', { error: e.message });
        return null;
    }
}

// ===== REMOVER JOB APÓS TIMEOUT =====
function scheduleJobRemoval(job) {
    setTimeout(() => {
        const index = jobQueue.findIndex(j => 
            (j.jobId === job.jobId && job.jobId !== null) || 
            (j.name === job.name && j.time === job.time)
        );
        if (index !== -1) {
            jobQueue.splice(index, 1);
            stats.totalExpired++;
            addLog('warning', `⏱️ Job expirado (${JOB_TIMEOUT/1000}s)`, {
                name: job.name,
                value: job.value,
                jobId: job.jobId || 'N/A'
            });
        }
    }, JOB_TIMEOUT);
}

// ===== PROCESSAR WEBHOOK =====
function processWebhook(req, res, category) {
    addLog('info', `📥 Processando webhook ${category}`);
    
    const job = parseWebhook(req.body);
    
    if (job) {
        // Verifica duplicados (só para jobs COM Job ID)
        let isDupe = false;
        if (job.jobId && category !== 'highlight') {
            isDupe = jobQueue.some(j => 
                j.jobId === job.jobId && (Date.now() - j.time) < DUPLICATE_WINDOW
            );
        }
        
        if (!isDupe) {
            job.category = category;
            jobQueue.push(job);
            stats.totalReceived++;
            stats.byWebhook[category]++;
            stats.lastUpdate = new Date().toISOString();
            
            scheduleJobRemoval(job);
            
            addLog('success', `✅ [${category.toUpperCase()}] Job adicionado`, {
                name: job.name,
                value: job.value,
                jobId: job.jobId || 'N/A',
                queueSize: jobQueue.length,
                timeout: `${JOB_TIMEOUT/1000}s`
            });
        } else {
            addLog('warning', '⚠️ Job duplicado ignorado', { jobId: job.jobId });
        }
    } else {
        stats.totalFailed++;
        addLog('error', '❌ Falha ao processar webhook');
    }
    
    res.status(200).send('OK');
}

// ===== ENDPOINTS =====
app.post('/webhook/normal', (req, res) => processWebhook(req, res, 'free'));
app.post('/webhook/special', (req, res) => processWebhook(req, res, 'basico'));
app.post('/webhook/highlight', (req, res) => processWebhook(req, res, 'highlight'));
app.post('/webhook/premium', (req, res) => processWebhook(req, res, 'premium'));
app.post('/webhook/mid-highlight', (req, res) => processWebhook(req, res, 'essencial'));
app.post('/discord-webhook', (req, res) => processWebhook(req, res, 'universal'));

// ===== ROBLOX PEGA JOB =====
app.get('/get-job', (req, res) => {
    // Remove apenas jobs REALMENTE expirados
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < JOB_TIMEOUT);
    
    if (jobQueue.length > 0) {
        // Ordena por prioridade: Premium > Essencial > Highlight > Básico > Free
        const priority = { premium: 5, essencial: 4, highlight: 3, basico: 2, free: 1 };
        jobQueue.sort((a, b) => (priority[b.category] || 0) - (priority[a.category] || 0));
        
        const job = jobQueue.shift();
        stats.totalProcessed++;
        
        addLog('success', '🚀 Job enviado para Roblox', { 
            name: job.name, 
            value: job.value,
            jobId: job.jobId || 'N/A',
            category: job.category
        });
        
        return res.json({
            success: true,
            job: {
                jobId: job.jobId || null,
                brainrotName: job.name,
                currentPlayers: job.players.split('/')[0],
                maxPlayers: job.players.split('/')[1],
                value: job.value,
                category: job.category,
                timestamp: new Date(job.time).toISOString()
            }
        });
    }
    
    res.json({ success: false, message: 'Nenhum job disponível' });
});

// ===== DASHBOARD =====
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Brainrot Auto-Joiner V3.0</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .status {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        }
        .status h2 {
            margin-bottom: 15px;
            font-size: 1.5em;
        }
        .stat-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .stat-item {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 0.9em;
            opacity: 0.8;
        }
        .online-badge {
            display: inline-block;
            background: #4ade80;
            color: #065f46;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9em;
        }
        .queue {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            max-height: 500px;
            overflow-y: auto;
        }
        .queue-item {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 10px;
            position: relative;
        }
        .queue-item .timer {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(239,68,68,0.3);
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 0.85em;
            font-weight: bold;
        }
        .value-highlight {
            color: #4ade80;
            font-weight: bold;
            font-size: 1.1em;
        }
        .category-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 5px;
            font-size: 0.75em;
            font-weight: bold;
            margin-left: 5px;
        }
        .premium { background: #fbbf24; color: #78350f; }
        .essencial { background: #f97316; color: #7c2d12; }
        .highlight { background: #a855f7; color: #581c87; }
        .basico { background: #ef4444; color: #7f1d1d; }
        .free { background: #3b82f6; color: #1e3a8a; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 ClufinNotify Auto-Joiner V3.0</h1>
            <span class="online-badge">● ONLINE</span>
            <p style="margin-top: 10px; opacity: 0.8;">Timeout: ${JOB_TIMEOUT/1000}s | Duplicados: ${DUPLICATE_WINDOW/1000}s</p>
        </div>
        
        <div class="status">
            <h2>📊 Estatísticas</h2>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${stats.totalReceived}</div>
                    <div class="stat-label">Recebidos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.totalProcessed}</div>
                    <div class="stat-label">Processados</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.totalExpired}</div>
                    <div class="stat-label">Expirados</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${jobQueue.length}</div>
                    <div class="stat-label">Na Fila</div>
                </div>
            </div>
        </div>
        
        <div class="queue">
            <h2>📋 Fila de Jobs</h2>
            ${jobQueue.length > 0 ? jobQueue.map(j => {
                const timeLeft = Math.max(0, Math.floor((JOB_TIMEOUT - (Date.now() - j.time)) / 1000));
                return `
                <div class="queue-item">
                    <div class="timer">⏱️ ${timeLeft}s</div>
                    <strong>${j.name}</strong>
                    <span class="category-badge ${j.category}">${j.category.toUpperCase()}</span><br>
                    <span class="value-highlight">💰 $${j.value}</span><br>
                    <small>Job ID: ${j.jobId || 'N/A'}</small><br>
                    <small>Jogadores: ${j.players}</small>
                </div>
            `}).join('') : '<div style="text-align: center; opacity: 0.6; padding: 40px;">Nenhum job na fila</div>'}
        </div>
    </div>
    
    <script>
        setTimeout(() => location.reload(), 2000);
    </script>
</body>
</html>
    `);
});

// ===== LIMPEZA AUTOMÁTICA =====
setInterval(() => {
    const before = jobQueue.length;
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < JOB_TIMEOUT);
    if (before > jobQueue.length) {
        addLog('info', `🧹 Limpeza: ${before - jobQueue.length} jobs expirados`);
    }
}, 10000); // A cada 10 segundos

// ===== INICIA SERVIDOR =====
app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🔥 CLUFIN NOTIFY AUTO-JOINER V3.0 🔥 ║');
    console.log('║     TIMEOUT OTIMIZADO - 15s            ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`🌐 Porta: ${PORT}`);
    console.log(`⏱️  Timeout dos Jobs: ${JOB_TIMEOUT/1000} segundos`);
    console.log(`🔄 Janela Anti-Duplicados: ${DUPLICATE_WINDOW/1000} segundos`);
    console.log(`✅ Servidor iniciado!\n`);
    addLog('success', 'Servidor V3.0 iniciado (Timeout: 15s)');
});
