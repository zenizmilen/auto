// ===== SERVIDOR AUTO-JOINER CORRIGIDO =====
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
    addLog('info', `Requisição recebida: ${req.method} ${req.path}`, {
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

// ===== PARSE WEBHOOK DO DISCORD - CORRIGIDO =====
function parseWebhook(body) {
    addLog('info', 'Tentando parsear webhook', { bodyKeys: Object.keys(body) });
    
    try {
        addLog('info', 'Corpo completo recebido', body);
        
        const embeds = body.embeds || [];
        addLog('info', `Encontrados ${embeds.length} embeds`);
        
        if (embeds.length === 0) {
            addLog('warning', 'Nenhum embed encontrado no webhook');
            return null;
        }
        
        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            addLog('info', `Processando embed ${i}`, { 
                title: embed.title,
                description: embed.description?.substring(0, 100),
                fields: embed.fields
            });
            
            // Extrai nome do título
            let name = 'Brainrot';
            let value = '0';
            
            if (embed.title) {
                // Remove emojis e extrai nome
                let titleClean = embed.title.replace(/[🔥💎⭐🚨☯️]/g, '').trim();
                
                // Extrai o valor do título se existir (formato: "Nome $1.5M/s")
                const titleValueMatch = titleClean.match(/\$([0-9.]+[KMBT]?\/s)/i);
                if (titleValueMatch) {
                    value = titleValueMatch[1];
                    // Remove o valor do nome
                    name = titleClean.replace(/\$[0-9.]+[KMBT]?\/s/i, '').trim();
                } else {
                    name = titleClean;
                }
            }
            
            // Extrai Job ID e Valor dos FIELDS
            let jobId = null;
            let players = 'N/A';
            
            if (embed.fields && Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                    addLog('info', 'Processando field', { name: field.name, value: field.value });
                    
                    // Campo de Job ID
                    if (field.name && (field.name.includes('Job ID') || field.name.includes('🌐'))) {
                        const jobMatch = field.value.match(/[`]*([a-f0-9\-]{36})[`]*/);
                        if (jobMatch) {
                            jobId = jobMatch[1];
                            addLog('success', 'Job ID encontrado', { jobId });
                        }
                    }
                    
                    // Campo de VALOR - CORRIGIDO
                    if (field.name && (field.name.includes('Valor') || field.name.includes('💰'))) {
                        // Remove ** (markdown bold), $ e espaços
                        const cleanValue = field.value.replace(/\*\*/g, '').replace(/\$/g, '').trim();
                        addLog('info', 'Valor extraído do campo', { raw: field.value, clean: cleanValue });
                        
                        // Extrai valor (formato: "1.5M/s" ou "$1.5M/s")
                        const valMatch = cleanValue.match(/([0-9.]+[KMBT]?\/s)/i);
                        if (valMatch) {
                            value = valMatch[1];
                            addLog('success', 'Valor parseado', { value });
                        }
                    }
                    
                    // Campo de Players
                    if (field.name && (field.name.includes('Players') || field.name.includes('👥'))) {
                        const playMatch = field.value.match(/(\d+)\/(\d+)/);
                        if (playMatch) {
                            players = `${playMatch[1]}/${playMatch[2]}`;
                        }
                    }
                }
            }
            
            // Se não encontrou valor nos fields, tenta extrair da description
            if (value === '0' && embed.description) {
                const descValueMatch = embed.description.match(/\$?([0-9.]+[KMBT]?\/s)/i);
                if (descValueMatch) {
                    value = descValueMatch[1];
                    addLog('success', 'Valor extraído da description', { value });
                }
            }
            
            // Para Highlight pode não ter Job ID
            if (jobId || name !== 'Brainrot') {
                addLog('success', 'Job parseado com sucesso', { 
                    jobId: jobId || 'N/A (Highlight)', 
                    name, 
                    players, 
                    value 
                });
                return { jobId: jobId || null, name, players, value, time: Date.now() };
            }
        }
        
        addLog('error', 'Nenhum job válido encontrado nos embeds');
        return null;
    } catch (e) {
        addLog('error', 'Erro ao parsear webhook', { error: e.message, stack: e.stack });
        return null;
    }
}

// ===== FUNÇÃO PARA REMOVER JOB APÓS 4 SEGUNDOS =====
function scheduleJobRemoval(job) {
    setTimeout(() => {
        const index = jobQueue.findIndex(j => 
            (j.jobId === job.jobId && job.jobId !== null) || 
            (j.name === job.name && j.time === job.time)
        );
        if (index !== -1) {
            jobQueue.splice(index, 1);
            stats.totalExpired++;
            addLog('warning', `Job removido por timeout (4s)`, {
                name: job.name,
                value: job.value,
                jobId: job.jobId || 'N/A',
                category: job.category
            });
        }
    }, 4000);
}

// ===== FUNÇÃO GENÉRICA PARA PROCESSAR WEBHOOKS =====
function processWebhook(req, res, category) {
    addLog('info', `Processando webhook ${category}`, {
        contentType: req.headers['content-type'],
        bodySize: JSON.stringify(req.body).length
    });
    
    const job = parseWebhook(req.body);
    
    if (job) {
        let isDupe = false;
        if (category !== 'highlight') {
            isDupe = jobQueue.some(j => 
                j.jobId === job.jobId && job.jobId !== null && (Date.now() - j.time) < 300000
            );
        }
        
        if (!isDupe) {
            job.category = category;
            jobQueue.push(job);
            stats.totalReceived++;
            stats.byWebhook[category]++;
            stats.lastUpdate = new Date().toISOString();
            
            scheduleJobRemoval(job);
            
            addLog('success', `[${category.toUpperCase()}] Job adicionado à fila`, {
                name: job.name,
                value: job.value,
                jobId: job.jobId || 'N/A',
                players: job.players,
                queueSize: jobQueue.length
            });
        } else {
            addLog('warning', 'Job duplicado ignorado', { jobId: job.jobId });
        }
    } else {
        stats.totalFailed++;
        addLog('error', 'Falha ao processar webhook - job inválido');
    }
    
    res.status(200).send('OK');
}

// ===== ENDPOINTS INDIVIDUAIS =====
app.post('/webhook/normal', (req, res) => processWebhook(req, res, 'free'));
app.post('/webhook/special', (req, res) => processWebhook(req, res, 'basico'));
app.post('/webhook/highlight', (req, res) => processWebhook(req, res, 'highlight'));
app.post('/webhook/premium', (req, res) => processWebhook(req, res, 'premium'));
app.post('/webhook/mid-highlight', (req, res) => processWebhook(req, res, 'essencial'));

// ===== ENDPOINT UNIVERSAL =====
app.post('/discord-webhook', (req, res) => processWebhook(req, res, 'universal'));

// ===== ROBLOX PEGA JOB =====
app.get('/get-job', (req, res) => {
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < 4000);
    
    if (jobQueue.length > 0) {
        const job = jobQueue.shift();
        stats.totalProcessed++;
        
        addLog('success', 'Job enviado para Roblox', { 
            name: job.name, 
            value: job.value,
            jobId: job.jobId || 'N/A' 
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
    const host = `${req.protocol}://${req.get('host')}`;
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Brainrot Auto-Joiner - ClufinNotify</title>
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
            max-height: 400px;
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 ClufinNotify Auto-Joiner</h1>
            <span class="online-badge">● ONLINE</span>
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
            <h2>📋 Fila de Jobs (Timeout: 4s)</h2>
            ${jobQueue.length > 0 ? jobQueue.map(j => {
                const timeLeft = Math.max(0, 4 - Math.floor((Date.now() - j.time) / 1000));
                return `
                <div class="queue-item">
                    <div class="timer">⏱️ ${timeLeft}s</div>
                    <strong>${j.name}</strong><br>
                    <span class="value-highlight">💰 $${j.value}</span><br>
                    <small>Job ID: ${j.jobId || 'N/A'}</small><br>
                    <small>Jogadores: ${j.players}</small>
                </div>
            `}).join('') : '<div style="text-align: center; opacity: 0.6; padding: 40px;">Nenhum job na fila</div>'}
        </div>
    </div>
    
    <script>
        setTimeout(() => location.reload(), 1000);
    </script>
</body>
</html>
    `);
});

// ===== LIMPA JOBS ANTIGOS =====
setInterval(() => {
    const before = jobQueue.length;
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < 4000);
    if (before > jobQueue.length) {
        addLog('info', `Limpeza automática: ${before - jobQueue.length} jobs expirados removidos`);
    }
}, 1000);

// ===== INICIA SERVIDOR =====
app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🔥 CLUFIN NOTIFY AUTO-JOINER 🔥      ║');
    console.log('║     VALOR CORRIGIDO - V2.0             ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`🌐 Porta: ${PORT}`);
    console.log(`⏱️  Timeout: 4 segundos`);
    console.log(`✅ Servidor iniciado com sucesso!\n`);
    addLog('success', 'Servidor ClufinNotify V2.0 iniciado (Correção de Valor)');
});
