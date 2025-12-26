// ===== SERVIDOR AUTO-JOINER V3.2 - DEBUG EXTREMO =====
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIGURAÇÃO =====
const JOB_TIMEOUT = 15000;
const DUPLICATE_WINDOW = 60000;

// ===== LOGS =====
let requestLog = [];
const MAX_LOGS = 200;

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
        'warning': '⚠️',
        'debug': '🔍'
    }[type] || '📝';
    
    console.log(`${emoji} [${new Date().toLocaleTimeString()}] ${message}`);
    if (data) console.log('   📦 Dados:', JSON.stringify(data, null, 2));
}

// ===== MIDDLEWARES (ORDEM CORRETA) =====

// 1. CORS (ANTES DE TUDO)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    if (req.method === 'OPTIONS') {
        addLog('info', 'Requisição OPTIONS (preflight)', { path: req.path });
        return res.sendStatus(200);
    }
    next();
});

// 2. LOG DE TODAS AS REQUISIÇÕES (ANTES DO PARSE)
app.use((req, res, next) => {
    addLog('info', `🌐 REQUISIÇÃO RECEBIDA: ${req.method} ${req.path}`, {
        ip: req.ip,
        headers: req.headers,
        query: req.query
    });
    next();
});

// 3. PARSE JSON (LIMITES AUMENTADOS)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 4. LOG DO BODY APÓS PARSE
app.use((req, res, next) => {
    if (req.body && Object.keys(req.body).length > 0) {
        addLog('debug', '📦 BODY PARSEADO', { 
            body: req.body,
            bodyType: typeof req.body,
            keys: Object.keys(req.body)
        });
    } else {
        addLog('warning', '⚠️ BODY VAZIO OU NÃO PARSEADO');
    }
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

// ===== PARSE WEBHOOK =====
function parseWebhook(body) {
    addLog('debug', '🔍 INICIANDO PARSE', { 
        bodyType: typeof body,
        isObject: typeof body === 'object',
        isNull: body === null,
        keys: body ? Object.keys(body) : []
    });
    
    try {
        // Verificação 1: Body existe?
        if (!body) {
            addLog('error', '❌ Body é null ou undefined');
            return null;
        }
        
        // Verificação 2: Tem embeds?
        if (!body.embeds) {
            addLog('error', '❌ Body não tem propriedade "embeds"', { body });
            return null;
        }
        
        // Verificação 3: Embeds é array?
        if (!Array.isArray(body.embeds)) {
            addLog('error', '❌ Embeds não é um array', { 
                embedsType: typeof body.embeds,
                embeds: body.embeds 
            });
            return null;
        }
        
        // Verificação 4: Array tem itens?
        const embeds = body.embeds;
        if (embeds.length === 0) {
            addLog('warning', '⚠️ Array de embeds está vazio');
            return null;
        }
        
        addLog('success', `✅ ${embeds.length} embed(s) encontrado(s)`);
        
        // Processar cada embed
        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            addLog('debug', `🔎 Processando embed #${i + 1}`, { 
                embed,
                keys: Object.keys(embed)
            });
            
            let name = 'Unknown';
            let value = '0';
            let jobId = null;
            let players = '0/0';
            
            // TÍTULO
            if (embed.title) {
                addLog('debug', '📝 Título encontrado', { title: embed.title });
                
                let titleClean = embed.title
                    .replace(/[🔥💎⭐🚨☯️\*]/g, '')
                    .trim();
                
                // Extrai valor (ex: $1.5K/s, 1.5K/s)
                const valueMatch = titleClean.match(/\$?([0-9.]+[KMBT]?\/s)/i);
                if (valueMatch) {
                    value = valueMatch[1];
                    name = titleClean.replace(/\$?[0-9.]+[KMBT]?\/s/i, '').trim();
                    addLog('success', '✅ Extraído do título', { name, value });
                } else {
                    name = titleClean;
                    addLog('info', 'ℹ️ Título sem valor monetário', { name });
                }
            }
            
            // DESCRIÇÃO
            if (embed.description) {
                addLog('debug', '📄 Descrição encontrada', { description: embed.description });
                
                if (value === '0') {
                    const descValueMatch = embed.description.match(/\$?([0-9.]+[KMBT]?\/s)/i);
                    if (descValueMatch) {
                        value = descValueMatch[1];
                        addLog('success', '✅ Valor extraído da descrição', { value });
                    }
                }
            }
            
            // FIELDS
            if (embed.fields && Array.isArray(embed.fields)) {
                addLog('debug', `📋 ${embed.fields.length} field(s) encontrado(s)`);
                
                for (const field of embed.fields) {
                    addLog('debug', '🔍 Field', { 
                        name: field.name, 
                        value: field.value 
                    });
                    
                    const fieldName = (field.name || '').toLowerCase();
                    const fieldValue = field.value || '';
                    
                    // Job ID
                    if (fieldName.includes('job') || fieldName.includes('id') || fieldName.includes('🌐')) {
                        const jobMatch = fieldValue.match(/([a-f0-9\-]{36})/i);
                        if (jobMatch) {
                            jobId = jobMatch[1];
                            addLog('success', '🔑 Job ID encontrado', { jobId });
                        }
                    }
                    
                    // Valor
                    if (fieldName.includes('valor') || fieldName.includes('value') || fieldName.includes('💰')) {
                        const cleanValue = fieldValue.replace(/[\*\$`]/g, '').trim();
                        const valMatch = cleanValue.match(/([0-9.]+[KMBT]?\/s)/i);
                        if (valMatch) {
                            value = valMatch[1];
                            addLog('success', '💰 Valor encontrado no field', { value });
                        }
                    }
                    
                    // Players
                    if (fieldName.includes('player') || fieldName.includes('jogador') || fieldName.includes('👥')) {
                        const playMatch = fieldValue.match(/(\d+)\/(\d+)/);
                        if (playMatch) {
                            players = `${playMatch[1]}/${playMatch[2]}`;
                            addLog('success', '👥 Players encontrados', { players });
                        }
                    }
                }
            }
            
            // VALIDAÇÃO FINAL
            const isValid = jobId || name !== 'Unknown';
            
            if (isValid) {
                const parsedJob = {
                    jobId: jobId || null,
                    name,
                    players,
                    value,
                    time: Date.now()
                };
                
                addLog('success', '🎉 JOB PARSEADO COM SUCESSO!', parsedJob);
                return parsedJob;
            } else {
                addLog('warning', '⚠️ Embed não contém job válido');
            }
        }
        
        addLog('error', '❌ Nenhum embed válido processado');
        return null;
        
    } catch (e) {
        addLog('error', '❌ ERRO CRÍTICO NO PARSE', { 
            error: e.message,
            stack: e.stack,
            body 
        });
        return null;
    }
}

// ===== TIMEOUT =====
function scheduleJobRemoval(job) {
    setTimeout(() => {
        const index = jobQueue.findIndex(j => 
            (j.jobId === job.jobId && job.jobId !== null) || 
            (j.name === job.name && j.time === job.time)
        );
        if (index !== -1) {
            jobQueue.splice(index, 1);
            stats.totalExpired++;
            addLog('warning', `⏱️ Job expirado`, { name: job.name, value: job.value });
        }
    }, JOB_TIMEOUT);
}

// ===== PROCESSAR WEBHOOK =====
function processWebhook(req, res, category) {
    addLog('info', `📥 PROCESSANDO WEBHOOK [${category.toUpperCase()}]`);
    
    const job = parseWebhook(req.body);
    
    if (job) {
        let isDupe = false;
        if (job.jobId) {
            isDupe = jobQueue.some(j => 
                j.jobId === job.jobId && (Date.now() - j.time) < DUPLICATE_WINDOW
            );
        }
        
        if (!isDupe) {
            job.category = category;
            jobQueue.push(job);
            stats.totalReceived++;
            stats.byWebhook[category] = (stats.byWebhook[category] || 0) + 1;
            stats.lastUpdate = new Date().toISOString();
            
            scheduleJobRemoval(job);
            
            addLog('success', `🎉 JOB ADICIONADO [${category.toUpperCase()}]`, {
                name: job.name,
                value: job.value,
                jobId: job.jobId || 'N/A',
                queueSize: jobQueue.length
            });
            
            return res.status(200).json({ 
                success: true, 
                message: 'Job adicionado com sucesso',
                job: {
                    name: job.name,
                    value: job.value,
                    category: job.category
                },
                queueSize: jobQueue.length 
            });
        } else {
            addLog('warning', '⚠️ Job duplicado', { jobId: job.jobId });
            return res.status(200).json({ 
                success: true, 
                message: 'Job duplicado (ignorado)' 
            });
        }
    } else {
        stats.totalFailed++;
        addLog('error', '❌ FALHA AO PROCESSAR WEBHOOK');
        return res.status(400).json({ 
            success: false, 
            error: 'Falha ao parsear webhook',
            message: 'Verifique o formato do body enviado'
        });
    }
}

// ===== ENDPOINTS =====

// Webhook genérico (PRIMEIRO, para pegar tudo)
app.post('/webhook', (req, res) => {
    addLog('info', '📨 Webhook genérico /webhook');
    processWebhook(req, res, 'free');
});

app.post('/discord-webhook', (req, res) => {
    addLog('info', '📨 Webhook /discord-webhook');
    processWebhook(req, res, 'free');
});

// Webhooks específicos
app.post('/webhook/normal', (req, res) => processWebhook(req, res, 'free'));
app.post('/webhook/special', (req, res) => processWebhook(req, res, 'basico'));
app.post('/webhook/highlight', (req, res) => processWebhook(req, res, 'highlight'));
app.post('/webhook/premium', (req, res) => processWebhook(req, res, 'premium'));
app.post('/webhook/mid-highlight', (req, res) => processWebhook(req, res, 'essencial'));

// Pegar job
app.get('/get-job', (req, res) => {
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < JOB_TIMEOUT);
    
    if (jobQueue.length > 0) {
        const priority = { premium: 5, essencial: 4, highlight: 3, basico: 2, free: 1 };
        jobQueue.sort((a, b) => (priority[b.category] || 0) - (priority[a.category] || 0));
        
        const job = jobQueue.shift();
        stats.totalProcessed++;
        
        addLog('success', '🚀 JOB ENVIADO', { 
            name: job.name,
            value: job.value,
            category: job.category
        });
        
        return res.json({
            success: true,
            job: {
                jobId: job.jobId || null,
                brainrotName: job.name,
                currentPlayers: job.players.split('/')[0] || '0',
                maxPlayers: job.players.split('/')[1] || '0',
                value: job.value,
                category: job.category,
                timestamp: new Date(job.time).toISOString()
            }
        });
    }
    
    res.json({ success: false, message: 'Nenhum job disponível' });
});

// Logs via API
app.get('/logs', (req, res) => {
    res.json({
        success: true,
        total: requestLog.length,
        logs: requestLog.slice(0, 100),
        stats
    });
});

// Teste manual
app.get('/test', (req, res) => {
    const testJob = {
        embeds: [{
            title: "🔥 Test Job $5K/s",
            fields: [
                { name: "Job ID", value: "test-12345" },
                { name: "Players", value: "5/10" }
            ]
        }]
    };
    
    addLog('info', '🧪 Teste manual iniciado');
    req.body = testJob;
    processWebhook(req, res, 'free');
});

// Dashboard
app.get('/', (req, res) => {
    const recentLogs = requestLog.slice(0, 20).map(log => {
        const time = new Date(log.time).toLocaleTimeString();
        const emoji = {
            'success': '✅',
            'error': '❌',
            'info': 'ℹ️',
            'warning': '⚠️',
            'debug': '🔍'
        }[log.type] || '📝';
        
        return `<div class="log-item log-${log.type}">
            ${emoji} <strong>[${time}]</strong> ${log.message}
            ${log.data ? `<br><small style="opacity:0.7;font-family:monospace">${JSON.stringify(log.data).substring(0, 150)}...</small>` : ''}
        </div>`;
    }).join('');
    
    const queueItems = jobQueue.map(j => {
        const timeLeft = Math.max(0, Math.floor((JOB_TIMEOUT - (Date.now() - j.time)) / 1000));
        return `<div class="queue-item">
            <div class="timer">⏱️ ${timeLeft}s</div>
            <strong>${j.name}</strong>
            <span class="category-badge ${j.category}">${j.category.toUpperCase()}</span><br>
            <span class="value-highlight">💰 $${j.value}</span><br>
            <small>📝 ${j.jobId || 'Sem ID'} | 👥 ${j.players}</small>
        </div>`;
    }).join('') || '<div style="text-align:center;opacity:0.6;padding:40px">📭 Fila vazia</div>';
    
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Auto-Joiner V3.2 DEBUG</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;min-height:100vh;padding:20px}
        .container{max-width:1600px;margin:0 auto}
        .header{text-align:center;margin-bottom:30px}
        .header h1{font-size:2.5em;margin-bottom:10px;text-shadow:2px 2px 4px rgba(0,0,0,.3)}
        .online-badge{display:inline-block;background:#4ade80;color:#065f46;padding:5px 15px;border-radius:20px;font-weight:bold;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
        .section{background:rgba(255,255,255,.1);backdrop-filter:blur(10px);border-radius:15px;padding:25px;margin-bottom:20px;box-shadow:0 8px 32px rgba(0,0,0,.2)}
        .section h2{margin-bottom:15px;font-size:1.5em}
        .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-top:15px}
        .stat-item{background:rgba(255,255,255,.1);padding:15px;border-radius:10px;text-align:center}
        .stat-value{font-size:2em;font-weight:bold;margin-bottom:5px}
        .stat-label{font-size:.9em;opacity:.8}
        .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
        .queue,.logs{max-height:600px;overflow-y:auto}
        .queue-item{background:rgba(255,255,255,.1);padding:15px;border-radius:10px;margin-bottom:10px;position:relative}
        .queue-item .timer{position:absolute;top:10px;right:10px;background:rgba(239,68,68,.3);padding:5px 10px;border-radius:5px;font-size:.85em;font-weight:bold}
        .value-highlight{color:#4ade80;font-weight:bold;font-size:1.1em}
        .category-badge{display:inline-block;padding:3px 8px;border-radius:5px;font-size:.75em;font-weight:bold;margin-left:5px}
        .premium{background:#fbbf24;color:#78350f}
        .essencial{background:#f97316;color:#7c2d12}
        .highlight{background:#a855f7;color:#581c87}
        .basico{background:#ef4444;color:#7f1d1d}
        .free{background:#3b82f6;color:#1e3a8a}
        .log-item{background:rgba(255,255,255,.05);padding:10px;border-radius:5px;margin-bottom:8px;font-size:.85em;border-left:3px solid;word-break:break-word}
        .log-success{border-color:#4ade80}
        .log-error{border-color:#ef4444}
        .log-warning{border-color:#fbbf24}
        .log-info{border-color:#3b82f6}
        .log-debug{border-color:#a855f7}
        @media(max-width:768px){.grid-2{grid-template-columns:1fr}}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 Auto-Joiner V3.2 DEBUG</h1>
            <span class="online-badge">● ONLINE</span>
            <p style="margin-top:10px;opacity:.8">Timeout: ${JOB_TIMEOUT/1000}s | Logs: ${requestLog.length}</p>
        </div>
        
        <div class="section">
            <h2>📊 Estatísticas</h2>
            <div class="stat-grid">
                <div class="stat-item"><div class="stat-value">${stats.totalReceived}</div><div class="stat-label">📥 Recebidos</div></div>
                <div class="stat-item"><div class="stat-value">${stats.totalProcessed}</div><div class="stat-label">✅ Processados</div></div>
                <div class="stat-item"><div class="stat-value">${stats.totalExpired}</div><div class="stat-label">⏱️ Expirados</div></div>
                <div class="stat-item"><div class="stat-value">${stats.totalFailed}</div><div class="stat-label">❌ Falhas</div></div>
                <div class="stat-item"><div class="stat-value">${jobQueue.length}</div><div class="stat-label">📋 Na Fila</div></div>
            </div>
        </div>
        
        <div class="grid-2">
            <div class="section queue">
                <h2>📋 Fila (${jobQueue.length})</h2>
                ${queueItems}
            </div>
            
            <div class="section logs">
                <h2>📄 Logs em Tempo Real</h2>
                ${recentLogs}
            </div>
        </div>
        
        <div class="section">
            <h2>🧪 Teste Manual</h2>
            <p style="opacity:.8;margin-bottom:10px">Clique no botão para enviar um job de teste</p>
            <button onclick="fetch('/test').then(r=>r.json()).then(d=>alert(JSON.stringify(d)))" 
                    style="background:#4ade80;color:#000;border:none;padding:10px 20px;border-radius:5px;font-weight:bold;cursor:pointer">
                🚀 Enviar Job de Teste
            </button>
        </div>
    </div>
    <script>setTimeout(()=>location.reload(),3000)</script>
</body>
</html>`);
});

// ===== LIMPEZA =====
setInterval(() => {
    const before = jobQueue.length;
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < JOB_TIMEOUT);
    const removed = before - jobQueue.length;
    if (removed > 0) {
        stats.totalExpired += removed;
        addLog('info', `🧹 ${removed} job(s) expirado(s)`);
    }
}, 10000);

// ===== INICIAR =====
app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  🔥 AUTO-JOINER V3.2 - DEBUG EXTREMO 🔥 ║');
    console.log('╚══════════════════════════════════════════╝\n');
    console.log(`🌐 Porta: ${PORT}`);
    console.log(`⏱️  Timeout: ${JOB_TIMEOUT/1000}s`);
    console.log(`\n📍 Endpoints:`);
    console.log(`   POST /webhook`);
    console.log(`   POST /discord-webhook`);
    console.log(`   POST /webhook/normal`);
    console.log(`   POST /webhook/special`);
    console.log(`   POST /webhook/highlight`);
    console.log(`   POST /webhook/premium`);
    console.log(`   POST /webhook/mid-highlight`);
    console.log(`   GET  /get-job`);
    console.log(`   GET  /logs`);
    console.log(`   GET  /test`);
    console.log(`\n✅ Servidor iniciado!\n`);
    addLog('success', '🚀 Servidor V3.2 com debug extremo iniciado');
});
