// ===== SERVIDOR AUTO-JOINER V3.3 - PARSE CORRIGIDO =====
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

// ===== MIDDLEWARES =====

// 1. CORS
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

// 2. LOG DE REQUISIÇÕES
app.use((req, res, next) => {
    addLog('info', `🌐 REQUISIÇÃO: ${req.method} ${req.path}`, {
        ip: req.ip,
        contentType: req.headers['content-type']
    });
    next();
});

// 3. PARSE JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 4. LOG DO BODY
app.use((req, res, next) => {
    if (req.body && Object.keys(req.body).length > 0) {
        addLog('debug', '📦 BODY RECEBIDO', { 
            bodyKeys: Object.keys(req.body),
            hasEmbeds: !!req.body.embeds,
            embedsLength: req.body.embeds?.length
        });
    } else {
        addLog('warning', '⚠️ BODY VAZIO');
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

// ===== PARSE WEBHOOK (VERSÃO CORRIGIDA) =====
function parseWebhook(body) {
    addLog('debug', '🔍 INICIANDO PARSE');
    
    try {
        if (!body || !body.embeds || !Array.isArray(body.embeds) || body.embeds.length === 0) {
            addLog('error', '❌ Body inválido ou sem embeds', { body });
            return null;
        }
        
        const embeds = body.embeds;
        addLog('success', `✅ ${embeds.length} embed(s) encontrado(s)`);
        
        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            addLog('debug', `🔎 Processando embed #${i + 1}`);
            
            let name = null;
            let value = null;
            let jobId = null;
            let players = '0/0';
            
            // ===== EXTRAÇÃO MAIS FLEXÍVEL =====
            
            // 1. Extrair todo o texto do embed
            const allText = [
                embed.title || '',
                embed.description || '',
                ...(embed.fields || []).map(f => `${f.name || ''} ${f.value || ''}`)
            ].join(' ');
            
            addLog('debug', '📝 Texto completo do embed', { allText: allText.substring(0, 200) });
            
            // 2. Procurar Job ID (UUID padrão)
            const jobIdMatch = allText.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (jobIdMatch) {
                jobId = jobIdMatch[1];
                addLog('success', '🔑 Job ID encontrado', { jobId });
            }
            
            // 3. Procurar VALOR (padrões flexíveis)
            // Aceita: $5K/s, 5K/s, $10M/s, 10M/s, $500/s, 500/s, $1.5K/s, 1.5K/s
            const valuePatterns = [
                /\$?\s*([0-9]+\.?[0-9]*\s*[KMBT]\/s)/gi,  // 5K/s, $5K/s, 1.5K/s
                /\$?\s*([0-9]+\.?[0-9]*)\s*\/\s*s/gi,      // 500/s, $500/s
                /valor[:\s]*\$?\s*([0-9]+\.?[0-9]*\s*[KMBT]?)/gi  // Valor: 5K, Valor: $5K
            ];
            
            for (const pattern of valuePatterns) {
                const matches = allText.match(pattern);
                if (matches && matches.length > 0) {
                    // Pega a primeira ocorrência
                    value = matches[0]
                        .replace(/valor[:\s]*/gi, '')
                        .replace(/\s+/g, '')
                        .trim();
                    
                    // Normaliza para sempre ter /s se for um número com K/M/B/T
                    if (value.match(/[KMBT]$/i) && !value.includes('/s')) {
                        value += '/s';
                    }
                    
                    addLog('success', '💰 Valor encontrado', { value, pattern: pattern.toString() });
                    break;
                }
            }
            
            // 4. Procurar PLAYERS (X/Y)
            const playersMatch = allText.match(/(\d+)\s*\/\s*(\d+)/);
            if (playersMatch) {
                players = `${playersMatch[1]}/${playersMatch[2]}`;
                addLog('success', '👥 Players encontrados', { players });
            }
            
            // 5. Extrair NOME do brainrot
            if (embed.title) {
                // Remove emojis, valores monetários e limpa
                name = embed.title
                    .replace(/[🔥💎⭐🚨☯️\*]/g, '')
                    .replace(/\$?\s*[0-9]+\.?[0-9]*\s*[KMBT]?\/s/gi, '')
                    .replace(/\$?\s*[0-9]+\.?[0-9]*\s*\/\s*s/gi, '')
                    .trim();
                
                if (name) {
                    addLog('success', '📝 Nome extraído do título', { name });
                }
            }
            
            // 6. Se não tem nome, tenta da descrição
            if (!name && embed.description) {
                name = embed.description
                    .split('\n')[0]
                    .replace(/[🔥💎⭐🚨☯️\*]/g, '')
                    .replace(/\$?\s*[0-9]+\.?[0-9]*\s*[KMBT]?\/s/gi, '')
                    .trim()
                    .substring(0, 50);
                
                if (name) {
                    addLog('info', '📝 Nome extraído da descrição', { name });
                }
            }
            
            // ===== VALIDAÇÃO FINAL MAIS PERMISSIVA =====
            const isValid = (jobId !== null) || (name && name.length > 2) || (value !== null);
            
            addLog('debug', '🔍 Validação', { 
                isValid, 
                hasJobId: jobId !== null,
                hasName: name && name.length > 2,
                hasValue: value !== null
            });
            
            if (isValid) {
                const parsedJob = {
                    jobId: jobId || null,
                    name: name || 'Brainrot',
                    players: players,
                    value: value || '0/s',
                    time: Date.now(),
                    rawEmbed: embed  // Guardar embed original para debug
                };
                
                addLog('success', '🎉 JOB PARSEADO!', {
                    name: parsedJob.name,
                    value: parsedJob.value,
                    jobId: parsedJob.jobId || 'N/A',
                    players: parsedJob.players
                });
                
                return parsedJob;
            } else {
                addLog('warning', '⚠️ Embed não passou na validação', {
                    jobId,
                    name,
                    value,
                    allText: allText.substring(0, 100)
                });
            }
        }
        
        addLog('error', '❌ Nenhum embed válido encontrado');
        return null;
        
    } catch (e) {
        addLog('error', '❌ ERRO NO PARSE', { 
            error: e.message,
            stack: e.stack.split('\n').slice(0, 3)
        });
        return null;
    }
}

// ===== TIMEOUT =====
function scheduleJobRemoval(job) {
    setTimeout(() => {
        const index = jobQueue.findIndex(j => 
            (j.jobId && j.jobId === job.jobId) || 
            (j.time === job.time)
        );
        if (index !== -1) {
            jobQueue.splice(index, 1);
            stats.totalExpired++;
            addLog('warning', `⏱️ Job expirado`, { name: job.name });
        }
    }, JOB_TIMEOUT);
}

// ===== REENVIAR PARA DISCORD =====
async function reenviarParaDiscord(body, category) {
    const WEBHOOKS = {
        free: "https://discord.com/api/webhooks/1451031458612252704/Oo1K9KNcTSRbRFcSTlveMyNnMA2DOKFATnYKSI8Q-RvMBPI5ZnqF0dRkjKgGHq7o5c1D",
        basico: "https://discord.com/api/webhooks/1449966669005848668/QAjwTBI7Erv6mZr5hTvsX3Ctgwofoboj7bZZot4v02f6TiGQJustRdsd_ax0vgCo9NTU",
        highlight: "https://discord.com/api/webhooks/1451031692927041678/Pwu3TLXC61aPFcXkz7xnz8P0hoq_vyI2z2-f9t6nSqQ5ncM7A4JsbplrBiDCMjDOKGTl",
        premium: "https://discord.com/api/webhooks/1451031769687134292/ZCdEm84p2TJPAztbpFUc0ovMRS8l97D9ZX9_70zBKCGHY_xufru7yySP5oyqRxpzmkBj",
        essencial: "https://discord.com/api/webhooks/1450158161959850086/E8uoVdUtw6qYnUi57zJEbAADvQ5OFXUdMGkR1cPu3934jA-Gm3jCvdbbEJhBbDROLHIf"
    };
    
    const webhookUrl = WEBHOOKS[category];
    if (!webhookUrl) return false;
    
    try {
        addLog('info', `📤 Reenviando [${category.toUpperCase()}]`);
        
        const https = require('https');
        const url = require('url');
        const parsedUrl = url.parse(webhookUrl);
        const postData = JSON.stringify(body);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        addLog('success', `✅ Discord OK [${category}]`);
                        resolve(true);
                    } else {
                        addLog('error', `❌ Discord falhou [${category}]: ${res.statusCode}`);
                        resolve(false);
                    }
                });
            });
            
            req.on('error', (error) => {
                addLog('error', '❌ Erro Discord', { error: error.message });
                resolve(false);
            });
            
            req.setTimeout(5000, () => {
                req.destroy();
                addLog('error', '❌ Timeout Discord');
                resolve(false);
            });
            
            req.write(postData);
            req.end();
        });
        
    } catch (error) {
        addLog('error', '❌ Exceção Discord', { error: error.message });
        return false;
    }
}

// ===== PROCESSAR WEBHOOK =====
async function processWebhook(req, res, category) {
    addLog('info', `📥 PROCESSANDO [${category.toUpperCase()}]`);
    
    // Reenviar para Discord (não bloqueia)
    reenviarParaDiscord(req.body, category).catch(err => {
        addLog('error', '❌ Erro ao reenviar', { error: err.message });
    });
    
    const job = parseWebhook(req.body);
    
    if (job) {
        // Verifica duplicação
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
            
            addLog('success', `🎉 JOB NA FILA [${category.toUpperCase()}]`, {
                name: job.name,
                value: job.value,
                queueSize: jobQueue.length
            });
            
            return res.status(200).json({ 
                success: true, 
                message: 'Job adicionado',
                job: {
                    name: job.name,
                    value: job.value,
                    category: job.category
                },
                queueSize: jobQueue.length 
            });
        } else {
            addLog('warning', '⚠️ Job duplicado (ignorado)');
            return res.status(200).json({ 
                success: true, 
                message: 'Duplicado' 
            });
        }
    } else {
        stats.totalFailed++;
        addLog('error', '❌ FALHA NO PARSE');
        
        // Log do body completo para debug
        addLog('debug', '📦 Body que falhou', { 
            body: JSON.stringify(req.body).substring(0, 500)
        });
        
        return res.status(200).json({ 
            success: false, 
            error: 'Falha ao parsear (verifique logs)'
        });
    }
}

// ===== ENDPOINTS =====

app.post('/webhook', async (req, res) => {
    await processWebhook(req, res, 'free');
});

app.post('/discord-webhook', async (req, res) => {
    await processWebhook(req, res, 'free');
});

app.post('/webhook/normal', async (req, res) => await processWebhook(req, res, 'free'));
app.post('/webhook/special', async (req, res) => await processWebhook(req, res, 'basico'));
app.post('/webhook/highlight', async (req, res) => await processWebhook(req, res, 'highlight'));
app.post('/webhook/premium', async (req, res) => await processWebhook(req, res, 'premium'));
app.post('/webhook/mid-highlight', async (req, res) => await processWebhook(req, res, 'essencial'));

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
    
    res.json({ success: false, message: 'Fila vazia' });
});

// Logs
app.get('/logs', (req, res) => {
    res.json({
        success: true,
        total: requestLog.length,
        logs: requestLog.slice(0, 100),
        stats,
        currentQueue: jobQueue.map(j => ({
            name: j.name,
            value: j.value,
            category: j.category,
            timeLeft: Math.floor((JOB_TIMEOUT - (Date.now() - j.time)) / 1000)
        }))
    });
});

// Teste
app.get('/test', (req, res) => {
    const testJob = {
        embeds: [{
            title: "🔥 Test Brainrot $5K/s",
            description: "Job de teste",
            fields: [
                { name: "Job ID", value: "12345678-1234-1234-1234-123456789abc" },
                { name: "Players", value: "5/10" }
            ]
        }]
    };
    
    addLog('info', '🧪 TESTE MANUAL');
    req.body = testJob;
    processWebhook(req, res, 'free');
});

// Dashboard
app.get('/', (req, res) => {
    const recentLogs = requestLog.slice(0, 30).map(log => {
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
            ${log.data ? `<br><small style="opacity:0.7;font-family:monospace;font-size:0.75em">${JSON.stringify(log.data).substring(0, 200)}...</small>` : ''}
        </div>`;
    }).join('');
    
    const queueItems = jobQueue.map(j => {
        const timeLeft = Math.max(0, Math.floor((JOB_TIMEOUT - (Date.now() - j.time)) / 1000));
        return `<div class="queue-item">
            <div class="timer">⏱️ ${timeLeft}s</div>
            <strong>${j.name}</strong>
            <span class="category-badge ${j.category}">${j.category.toUpperCase()}</span><br>
            <span class="value-highlight">💰 ${j.value}</span><br>
            <small>📝 ${j.jobId ? j.jobId.substring(0, 8) + '...' : 'Sem ID'} | 👥 ${j.players}</small>
        </div>`;
    }).join('') || '<div style="text-align:center;opacity:0.6;padding:40px">📭 Fila vazia</div>';
    
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Auto-Joiner V3.3</title>
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
        button{background:#4ade80;color:#000;border:none;padding:10px 20px;border-radius:5px;font-weight:bold;cursor:pointer;transition:all .3s}
        button:hover{background:#22c55e;transform:translateY(-2px)}
        @media(max-width:768px){.grid-2{grid-template-columns:1fr}}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 Auto-Joiner V3.3</h1>
            <span class="online-badge">● ONLINE</span>
            <p style="margin-top:10px;opacity:.8">Parse Corrigido | Timeout: ${JOB_TIMEOUT/1000}s</p>
        </div>
        
        <div class="section">
            <h2>📊 Estatísticas</h2>
            <div class="stat-grid">
                <div class="stat-item"><div class="stat-value">${stats.totalReceived}</div><div class="stat-label">📥 Recebidos</div></div>
                <div class="stat-item"><div class="stat-value">${stats.totalProcessed}</div><div class="stat-label">✅ Processados</div></div>
                <div class="stat-item"><div class="stat-value">${stats.totalExpired}</div><div class="stat-label">⏱️ Expirados</div></div>
                <div class="stat-item"><div class="stat-value">${stats.totalFailed}</div><div class="stat-label">❌ Falhas</div></div>
                <div class="stat-item" style="background:rgba(74,222,128,.2)"><div class="stat-value">${jobQueue.length}</div><div class="stat-label">📋 NA FILA</div></div>
            </div>
        </div>
        
        <div class="grid-2">
            <div class="section queue">
                <h2>📋 Fila Atual (${jobQueue.length})</h2>
                ${queueItems}
            </div>
            
            <div class="section logs">
                <h2>📄 Logs (últimos 30)</h2>
                ${recentLogs}
            </div>
        </div>
        
        <div class="section">
            <h2>🧪 Teste Manual</h2>
            <p style="opacity:.8;margin-bottom:10px">Enviar job de teste para verificar funcionamento</p>
            <button onclick="fetch('/test').then(r=>r.json()).then(d=>{alert(JSON.stringify(d,null,2));location.reload()})">
                🚀 Enviar Job de Teste
            </button>
            <button onclick="fetch('/logs').then(r=>r.json()).then(d=>console.log(d))" style="margin-left:10px;background:#3b82f6">
                📄 Ver Logs no Console
            </button>
        </div>
    </div>
    <script>setTimeout(()=>location.reload(),5000)</script>
</body>
</html>`);
});

// Limpeza periódica
setInterval(() => {
    const before = jobQueue.length;
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < JOB_TIMEOUT);
    const removed = before - jobQueue.length;
    if (removed > 0) {
        stats.totalExpired += removed;
        addLog('info', `🧹 ${removed} job(s) expirado(s)`);
    }
}, 10000);

// Iniciar
app.listen(PORT, () => {
    console.log('\n╔
