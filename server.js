// ===== SERVIDOR AUTO-JOINER GRATUITO =====
// Para usar no Replit.com ou Render.com

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

// Middleware para logar TODAS as requisições
app.use((req, res, next) => {
    addLog('info', `Requisição recebida: ${req.method} ${req.path}`, {
        headers: req.headers,
        ip: req.ip
    });
    next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
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
    addLog('info', 'Tentando parsear webhook', { bodyKeys: Object.keys(body) });
    
    try {
        // Log do corpo completo
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
            
            // Tenta extrair do TITLE primeiro (formato: "🔥 Nome do Brainrot" ou "💎 Nome do Brainrot")
            let name = 'Brainrot';
            if (embed.title) {
                const titleMatch = embed.title.match(/[🔥💎⭐🚨☯️]/);
                if (titleMatch) {
                    name = embed.title.replace(/[🔥💎⭐🚨☯️]/g, '').trim();
                    // Remove " - " e sufixos
                    name = name.replace(/\s*-\s*.*$/i, '').trim();
                    // Remove valores /s
                    name = name.replace(/\s*\d+\.?\d*[KMBT]?\/s.*$/i, '').trim();
                }
            }
            
            // Extrai Job ID dos FIELDS
            let jobId = null;
            let players = 'N/A';
            let value = '0';
            
            if (embed.fields && Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                    // Procura pelo campo com Job ID
                    if (field.name && (field.name.includes('Job ID') || field.name.includes('🌐'))) {
                        const jobMatch = field.value.match(/[`]*([a-f0-9\-]{36})[`]*/);
                        if (jobMatch) {
                            jobId = jobMatch[1];
                        }
                    }
                    
                    // Procura pelo campo de Valor
                    if (field.name && (field.name.includes('Valor') || field.name.includes('💰'))) {
                        const valMatch = field.value.match(/\$?([0-9.]+[KMBT]?)/);
                        if (valMatch) {
                            value = valMatch[1];
                        }
                    }
                    
                    // Procura jogadores no campo "Players" ou "Informações do Server"
                    if (field.name && (field.name.includes('Players') || field.name.includes('👥') || field.name.includes('Informações'))) {
                        const playMatch = field.value.match(/(\d+)\/(\d+)/);
                        if (playMatch) {
                            players = `${playMatch[1]}/${playMatch[2]}`;
                        }
                    }
                }
            }
            
            // Se não achou nos fields, tenta na description
            if (!jobId) {
                const desc = embed.description || '';
                const jobMatch = desc.match(/[`]*([a-f0-9\-]{36})[`]*/);
                if (jobMatch) {
                    jobId = jobMatch[1];
                }
            }
            
            // Para Highlight, não precisa de Job ID (pode ser null)
            if (jobId || name !== 'Brainrot') {
                addLog('success', 'Job parseado com sucesso', { jobId: jobId || 'N/A (Highlight)', name, players, value });
                return { jobId: jobId || null, name, players, value, time: Date.now() };
            } else {
                addLog('warning', 'Job ID não encontrado no embed', { 
                    title: embed.title,
                    fields: embed.fields 
                });
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
                jobId: job.jobId || 'N/A',
                category: job.category
            });
        }
    }, 4000); // 4 segundos
}

// ===== FUNÇÃO GENÉRICA PARA PROCESSAR WEBHOOKS =====
function processWebhook(req, res, category) {
    addLog('info', `Processando webhook ${category}`, {
        contentType: req.headers['content-type'],
        bodySize: JSON.stringify(req.body).length
    });
    
    const job = parseWebhook(req.body);
    
    if (job) {
        // Para Highlight, não verifica duplicata por Job ID (pode não ter)
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
            
            // Agenda remoção automática após 4 segundos
            scheduleJobRemoval(job);
            
            addLog('success', `[${category.toUpperCase()}] Job adicionado à fila (será removido em 4s)`, {
                name: job.name,
                jobId: job.jobId || 'N/A (sem Job ID)',
                players: job.players,
                value: job.value,
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
    // Remove jobs que já expiraram (mais de 4 segundos)
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < 4000);
    
    if (jobQueue.length > 0) {
        const job = jobQueue.shift();
        stats.totalProcessed++;
        
        addLog('success', 'Job enviado para Roblox', { name: job.name, jobId: job.jobId || 'N/A' });
        
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

// ===== DASHBOARD COM LOGS =====
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
        .webhook-list { margin-top: 15px; }
        .webhook-item {
            background: rgba(255,255,255,0.1);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 10px;
            font-size: 0.85em;
        }
        .webhook-item strong {
            display: block;
            margin-bottom: 5px;
            color: #fbbf24;
        }
        code {
            background: rgba(0,0,0,0.3);
            padding: 3px 8px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
            word-break: break-all;
        }
        .logs {
            background: rgba(0,0,0,0.4);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            max-height: 500px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
        }
        .log-item {
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 5px;
            border-left: 4px solid;
        }
        .log-success { background: rgba(34,197,94,0.2); border-color: #22c55e; }
        .log-error { background: rgba(239,68,68,0.2); border-color: #ef4444; }
        .log-warning { background: rgba(251,191,36,0.2); border-color: #fbbf24; }
        .log-info { background: rgba(59,130,246,0.2); border-color: #3b82f6; }
        .log-time { opacity: 0.6; font-size: 0.9em; }
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
        .queue-empty {
            text-align: center;
            opacity: 0.6;
            padding: 40px;
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
        .badge-failed {
            background: #ef4444;
            color: white;
            padding: 3px 8px;
            border-radius: 5px;
            font-size: 0.85em;
            margin-left: 10px;
        }
        .timeout-warning {
            background: rgba(251,191,36,0.2);
            border: 2px solid #fbbf24;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            text-align: center;
        }
        .category-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 5px;
            font-size: 0.85em;
            font-weight: bold;
            margin-left: 8px;
        }
        .badge-free { background: rgba(91, 134, 229, 0.3); color: #93c5fd; }
        .badge-basico { background: rgba(251, 113, 33, 0.3); color: #fb923c; }
        .badge-highlight { background: rgba(155, 89, 182, 0.3); color: #c084fc; }
        .badge-essencial { background: rgba(251, 191, 36, 0.3); color: #fbbf24; }
        .badge-premium { background: rgba(239, 68, 68, 0.3); color: #ef4444; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 ClufinNotify Auto-Joiner</h1>
            <span class="online-badge">● ONLINE</span>
            ${stats.totalFailed > 0 ? `<span class="badge-failed">${stats.totalFailed} Falhas</span>` : ''}
        </div>
        
        <div class="timeout-warning">
            ⏱️ <strong>Jobs são removidos automaticamente após 4 segundos na fila</strong>
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
                    <div class="stat-value">${stats.totalFailed}</div>
                    <div class="stat-label">Falhados</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${jobQueue.length}</div>
                    <div class="stat-label">Na Fila</div>
                </div>
            </div>
            
            <h3 style="margin-top: 20px; margin-bottom: 10px;">📈 Por Categoria</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.free}</div>
                    <div class="stat-label">⭐ FREE</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.basico}</div>
                    <div class="stat-label">🔥 BÁSICO</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.essencial}</div>
                    <div class="stat-label">⭐ ESSENCIAL</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.premium}</div>
                    <div class="stat-label">🚨 PREMIUM</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.highlight}</div>
                    <div class="stat-label">💎 HIGHLIGHT</div>
                </div>
            </div>
        </div>
        
        <div class="status">
            <h2>🔗 URLs dos Webhooks</h2>
            <div class="webhook-list">
                <div class="webhook-item">
                    <strong>⭐ FREE (1M - 9.9M):</strong>
                    <code>${host}/webhook/normal</code>
                </div>
                <div class="webhook-item">
                    <strong>🔥 BÁSICO (10M - 49.9M com Job ID):</strong>
                    <code>${host}/webhook/special</code>
                </div>
                <div class="webhook-item">
                    <strong>⭐ ESSENCIAL (50M - 99.9M):</strong>
                    <code>${host}/webhook/mid-highlight</code>
                </div>
                <div class="webhook-item">
                    <strong>🚨 PREMIUM (100M - 399.9M):</strong>
                    <code>${host}/webhook/premium</code>
                </div>
                <div class="webhook-item">
                    <strong>💎 HIGHLIGHT (>= 10M SEM Job ID):</strong>
                    <code>${host}/webhook/highlight</code>
                </div>
            </div>
        </div>
        
        <div class="logs">
            <h2 style="margin-bottom: 15px;">📝 Logs em Tempo Real</h2>
            ${requestLog.length > 0 ? requestLog.map(log => `
                <div class="log-item log-${log.type}">
                    <span class="log-time">${new Date(log.time).toLocaleTimeString('pt-BR')}</span>
                    <div>${log.message}</div>
                    ${log.data ? `<pre style="margin-top: 5px; opacity: 0.8; font-size: 0.9em;">${JSON.stringify(log.data, null, 2)}</pre>` : ''}
                </div>
            `).join('') : '<div style="text-align: center; opacity: 0.6;">Nenhum log ainda...</div>'}
        </div>
        
        <div class="queue" style="margin-top: 20px;">
            <h2>📋 Fila de Jobs (Timeout: 4s)</h2>
            ${jobQueue.length > 0 ? jobQueue.map(j => {
                const timeLeft = Math.max(0, 4 - Math.floor((Date.now() - j.time) / 1000));
                const categoryBadge = {
                    free: '<span class="category-badge badge-free">⭐ FREE</span>',
                    basico: '<span class="category-badge badge-basico">🔥 BÁSICO</span>',
                    highlight: '<span class="category-badge badge-highlight">💎 HIGHLIGHT</span>',
                    essencial: '<span class="category-badge badge-essencial">⭐ ESSENCIAL</span>',
                    premium: '<span class="category-badge badge-premium">🚨 PREMIUM</span>'
                }[j.category] || '';
                
                return `
                <div class="queue-item">
                    <div class="timer">⏱️ ${timeLeft}s</div>
                    <strong>${j.name}</strong> ${categoryBadge}<br>
                    <small>Job ID: ${j.jobId || 'N/A (sem Job ID)'}</small><br>
                    <small>Jogadores: ${j.players} | Valor: $${j.value}/s</small>
                </div>
            `}).join('') : '<div class="queue-empty">Nenhum job na fila</div>'}
        </div>
    </div>
    
    <script>
        setTimeout(() => location.reload(), 1000);
    </script>
</body>
</html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        online: true,
        queueSize: jobQueue.length,
        stats: stats,
        logs: requestLog.slice(0, 20),
        queue: jobQueue.map(j => ({
            name: j.name,
            jobId: j.jobId || null,
            players: j.players,
            value: j.value,
            category: j.category,
            time: new Date(j.time).toISOString(),
            timeLeft: Math.max(0, 4 - Math.floor((Date.now() - j.time) / 1000))
        }))
    });
});

// ===== LIMPA JOBS ANTIGOS =====
setInterval(() => {
    const before = jobQueue.length;
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < 4000);
    if (before > jobQueue.length) {
        addLog('info', `Limpeza automática: ${before - jobQueue.length} jobs expirados removidos`);
    }
}, 1000); // Verifica a cada 1 segundo

// ===== INICIA SERVIDOR =====
app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🔥 CLUFIN NOTIFY AUTO-JOINER 🔥      ║');
    console.log('║     MODE: PRODUCTION (TIMEOUT 4s)      ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`🌐 Porta: ${PORT}`);
    console.log(`⏱️  Timeout: 4 segundos`);
    console.log(`📥 Webhooks configurados:`);
    console.log(`   ⭐ FREE: /webhook/normal (1M - 9.9M)`);
    console.log(`   🔥 BÁSICO: /webhook/special (10M - 49.9M)`);
    console.log(`   ⭐ ESSENCIAL: /webhook/mid-highlight (50M - 99.9M)`);
    console.log(`   🚨 PREMIUM: /webhook/premium (100M - 399.9M)`);
    console.log(`   💎 HIGHLIGHT: /webhook/highlight (>= 10M SEM Job ID)`);
    console.log(`   🌐 Universal: /discord-webhook`);
    console.log(`📤 API: /get-job`);
    console.log(`📊 Dashboard: /\n`);
    console.log('✅ Aguardando notificações...\n');
    addLog('success', 'Servidor ClufinNotify iniciado com sucesso (Timeout: 4s)');
});
