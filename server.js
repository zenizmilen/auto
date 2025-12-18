// ===== SERVIDOR AUTO-JOINER GRATUITO =====
// Para usar no Replit.com ou Render.com

const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// ===== WEBHOOKS DO DISCORD =====
const WEBHOOKS = {
    normal: "https://discord.com/api/webhooks/1451031458612252704/Oo1K9KNcTSRbRFcSTlveMyNnMA2DOKFATnYKSI8Q-RvMBPI5ZnqF0dRkjKgGHq7o5c1D", // 1M a 9M
    special: "https://discord.com/api/webhooks/1449966669005848668/QAjwTBI7Erv6mZr5hTvsX3Ctgwofoboj7bZZot4v02f6TiGQJustRdsd_ax0vgCo9NTU", // 10M a 99M
    ultraHigh: "https://discord.com/api/webhooks/1451031692927041678/Pwu3TLXC61aPFcXkz7xnz8P0hoq_vyI2z2-f9t6nSSqQ5ncM7A4JsbplrBiDCMjDOKGTl", // 100M a 149M
    highlight: "https://discord.com/api/webhooks/1451031769687134292/ZCdEm84p2TJPAztbpFUc0ovMRS8l97D9ZX9_70zBKCGHY_xufru7yySP5oyqRxpzmkBj", // 150M+
    midHighlight: "https://discord.com/api/webhooks/1450158161959850086/E8uoVdUtw6qYnUi57zJEbAADvQ5OFXUdMGkR1cPu3934jA-Gm3jCvdbbEJhBbDROLHIf" // 300M+
};

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
    lastUpdate: null,
    startTime: new Date().toISOString(),
    byWebhook: {
        normal: 0,
        special: 0,
        ultraHigh: 0,
        highlight: 0,
        midHighlight: 0
    }
};

// ===== PARSE WEBHOOK DO DISCORD =====
function parseWebhook(body) {
    try {
        const embeds = body.embeds || [];
        
        for (const embed of embeds) {
            const desc = embed.description || '';
            
            // Extrai nome do brainrot
            const nameMatch = desc.match(/🔥\s*(.+?)[\n\r]/);
            const name = nameMatch ? nameMatch[1].trim() : 'Brainrot';
            
            // Extrai Job ID
            const jobMatch = desc.match(/Server ID:\s*\n\s*([a-f0-9\-]+)/);
            const jobId = jobMatch ? jobMatch[1].trim() : null;
            
            // Extrai jogadores
            const playersMatch = desc.match(/Jogadores:\s*(\d+)\/(\d+)/);
            const players = playersMatch ? `${playersMatch[1]}/${playersMatch[2]}` : 'N/A';
            
            // Extrai valor
            const valueMatch = desc.match(/\$([0-9.]+[MK]?)\/s/);
            const value = valueMatch ? valueMatch[1] : '0';
            
            if (jobId) {
                return { jobId, name, players, value, time: Date.now() };
            }
        }
        return null;
    } catch (e) {
        console.error('Parse error:', e);
        return null;
    }
}

// ===== RECEBE WEBHOOK PRINCIPAL (TODAS AS CATEGORIAS) =====
app.post('/discord-webhook', (req, res) => {
    const job = parseWebhook(req.body);
    
    if (job) {
        // Evita duplicatas (últimos 5 minutos)
        const isDupe = jobQueue.some(j => 
            j.jobId === job.jobId && (Date.now() - j.time) < 300000
        );
        
        if (!isDupe) {
            jobQueue.push(job);
            stats.totalReceived++;
            stats.lastUpdate = new Date().toISOString();
            
            console.log(`✅ [${new Date().toLocaleTimeString()}] Job recebido: ${job.name}`);
            console.log(`   Job ID: ${job.jobId}`);
            console.log(`   Jogadores: ${job.players} | Valor: $${job.value}/s`);
            console.log(`   Fila: ${jobQueue.length} jobs\n`);
        }
    }
    
    res.status(200).send('OK');
});

// ===== ENDPOINTS INDIVIDUAIS PARA CADA WEBHOOK =====
app.post('/webhook/normal', (req, res) => {
    const job = parseWebhook(req.body);
    if (job && !jobQueue.some(j => j.jobId === job.jobId && (Date.now() - j.time) < 300000)) {
        jobQueue.push(job);
        stats.totalReceived++;
        stats.byWebhook.normal++;
        stats.lastUpdate = new Date().toISOString();
        console.log(`✅ [NORMAL] ${job.name} - $${job.value}/s`);
    }
    res.status(200).send('OK');
});

app.post('/webhook/special', (req, res) => {
    const job = parseWebhook(req.body);
    if (job && !jobQueue.some(j => j.jobId === job.jobId && (Date.now() - j.time) < 300000)) {
        jobQueue.push(job);
        stats.totalReceived++;
        stats.byWebhook.special++;
        stats.lastUpdate = new Date().toISOString();
        console.log(`✅ [SPECIAL] ${job.name} - $${job.value}/s`);
    }
    res.status(200).send('OK');
});

app.post('/webhook/ultra-high', (req, res) => {
    const job = parseWebhook(req.body);
    if (job && !jobQueue.some(j => j.jobId === job.jobId && (Date.now() - j.time) < 300000)) {
        jobQueue.push(job);
        stats.totalReceived++;
        stats.byWebhook.ultraHigh++;
        stats.lastUpdate = new Date().toISOString();
        console.log(`✅ [ULTRA HIGH] ${job.name} - $${job.value}/s`);
    }
    res.status(200).send('OK');
});

app.post('/webhook/highlight', (req, res) => {
    const job = parseWebhook(req.body);
    if (job && !jobQueue.some(j => j.jobId === job.jobId && (Date.now() - j.time) < 300000)) {
        jobQueue.push(job);
        stats.totalReceived++;
        stats.byWebhook.highlight++;
        stats.lastUpdate = new Date().toISOString();
        console.log(`✅ [HIGHLIGHT] ${job.name} - $${job.value}/s`);
    }
    res.status(200).send('OK');
});

app.post('/webhook/mid-highlight', (req, res) => {
    const job = parseWebhook(req.body);
    if (job && !jobQueue.some(j => j.jobId === job.jobId && (Date.now() - j.time) < 300000)) {
        jobQueue.push(job);
        stats.totalReceived++;
        stats.byWebhook.midHighlight++;
        stats.lastUpdate = new Date().toISOString();
        console.log(`✅ [MID HIGHLIGHT] ${job.name} - $${job.value}/s`);
    }
    res.status(200).send('OK');
});

// ===== ROBLOX PEGA JOB =====
app.get('/get-job', (req, res) => {
    // Remove jobs expirados (10 min)
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < 600000);
    
    if (jobQueue.length > 0) {
        const job = jobQueue.shift();
        stats.totalProcessed++;
        
        console.log(`📤 [${new Date().toLocaleTimeString()}] Job enviado: ${job.name}\n`);
        
        return res.json({
            success: true,
            job: {
                jobId: job.jobId,
                brainrotName: job.name,
                currentPlayers: job.players.split('/')[0],
                maxPlayers: job.players.split('/')[1],
                value: job.value,
                timestamp: new Date(job.time).toISOString()
            }
        });
    }
    
    res.json({ success: false, message: 'Nenhum job disponível' });
});

// ===== STATUS/DASHBOARD =====
app.get('/', (req, res) => {
    const host = `${req.protocol}://${req.get('host')}`;
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Brainrot Auto-Joiner</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
        }
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
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
        .webhook-list {
            margin-top: 15px;
        }
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔥 Brainrot Auto-Joiner</h1>
            <span class="online-badge">● ONLINE</span>
        </div>
        
        <div class="status">
            <h2>📊 Estatísticas</h2>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${stats.totalReceived}</div>
                    <div class="stat-label">Total Recebidos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.totalProcessed}</div>
                    <div class="stat-label">Total Processados</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${jobQueue.length}</div>
                    <div class="stat-label">Na Fila</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleTimeString('pt-BR') : 'N/A'}</div>
                    <div class="stat-label">Última Atualização</div>
                </div>
            </div>
            
            <h3 style="margin-top: 20px; margin-bottom: 10px;">📈 Por Categoria</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.normal}</div>
                    <div class="stat-label">Normal (1-9M)</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.special}</div>
                    <div class="stat-label">Special (10-99M)</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.ultraHigh}</div>
                    <div class="stat-label">Ultra High (100-149M)</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.highlight}</div>
                    <div class="stat-label">Highlight (150M+)</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.byWebhook.midHighlight}</div>
                    <div class="stat-label">Mid Highlight (300M+)</div>
                </div>
            </div>
        </div>
        
        <div class="status">
            <h2>🔗 URLs dos Webhooks</h2>
            <p style="margin: 10px 0; opacity: 0.9;">Configure estes webhooks no seu ClufinNotify:</p>
            
            <div class="webhook-list">
                <div class="webhook-item">
                    <strong>🟢 Normal (1M - 9M):</strong>
                    <code>${host}/webhook/normal</code>
                </div>
                <div class="webhook-item">
                    <strong>🟡 Special (10M - 99M):</strong>
                    <code>${host}/webhook/special</code>
                </div>
                <div class="webhook-item">
                    <strong>🟠 Ultra High (100M - 149M):</strong>
                    <code>${host}/webhook/ultra-high</code>
                </div>
                <div class="webhook-item">
                    <strong>🔴 Highlight (150M+):</strong>
                    <code>${host}/webhook/highlight</code>
                </div>
                <div class="webhook-item">
                    <strong>🟣 Mid Highlight (300M+):</strong>
                    <code>${host}/webhook/mid-highlight</code>
                </div>
            </div>
            
            <p style="margin: 15px 0 0 0; font-size: 0.9em; opacity: 0.8;">
                ⚠️ Ou use um único endpoint para todos: <code>${host}/discord-webhook</code>
            </p>
        </div>
        
        <div class="queue">
            <h2>📋 Fila de Jobs</h2>
            ${jobQueue.length > 0 ? jobQueue.map(j => `
                <div class="queue-item">
                    <strong>🔥 ${j.name}</strong><br>
                    <small>Job ID: ${j.jobId}</small><br>
                    <small>Jogadores: ${j.players} | Valor: $${j.value}/s</small>
                </div>
            `).join('') : '<div class="queue-empty">Nenhum job na fila</div>'}
        </div>
    </div>
    
    <script>
        // Auto-refresh a cada 3 segundos
        setTimeout(() => location.reload(), 3000);
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
        queue: jobQueue.map(j => ({
            name: j.name,
            players: j.players,
            value: j.value,
            time: new Date(j.time).toISOString()
        }))
    });
});

// ===== LIMPA JOBS ANTIGOS =====
setInterval(() => {
    const before = jobQueue.length;
    jobQueue = jobQueue.filter(j => (Date.now() - j.time) < 600000);
    if (before > jobQueue.length) {
        console.log(`🧹 Limpeza: ${before - jobQueue.length} jobs expirados removidos`);
    }
}, 60000);

// ===== INICIA SERVIDOR =====
app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   🔥 SERVIDOR AUTO-JOINER ONLINE 🔥   ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`🌐 Porta: ${PORT}`);
    console.log(`📥 Webhooks configurados:`);
    console.log(`   • Normal: /webhook/normal`);
    console.log(`   • Special: /webhook/special`);
    console.log(`   • Ultra High: /webhook/ultra-high`);
    console.log(`   • Highlight: /webhook/highlight`);
    console.log(`   • Mid Highlight: /webhook/mid-highlight`);
    console.log(`📤 API: /get-job`);
    console.log(`📊 Dashboard: /\n`);
    console.log('✅ Aguardando notificações...\n');
});


