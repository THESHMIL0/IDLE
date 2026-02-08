const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let BOARD_SIZE = 600;
const FRICTION = 0.975;
const ELASTICITY = 0.6;

// Game State
let gameState = 'MENU';
let gameMode = 'ai';
let coins = parseInt(localStorage.getItem('carrom_coins')) || 0;
let currentPlayer = 1;
let isTurnActive = false;
let isDragging = false;
let dragStartX = 0, dragStartY = 0;

// Shop Data
let currentSkin = localStorage.getItem('carrom_skin') || '#ffffff';
let ownedSkins = JSON.parse(localStorage.getItem('carrom_owned')) || ['white'];
const skins = [
    { id: 'white', name: 'Classic', color: '#ffffff', price: 0 },
    { id: 'gold', name: 'Gold Pro', color: '#ffd700', price: 200 },
    { id: 'neon', name: 'Neon Cyan', color: '#00ffff', price: 500 },
    { id: 'red', name: 'Dragon', color: '#ff3333', price: 800 }
];

// Entities
let striker = { x: 0, y: 0, vx: 0, vy: 0, r: 0, color: '#fff' };
let pucks = [];
let pockets = [];

function resize() {
    let size = Math.min(window.innerWidth, window.innerHeight) * 0.95;
    canvas.width = size;
    canvas.height = size;
    BOARD_SIZE = size;
    let r = BOARD_SIZE * 0.07;
    pockets = [{x:r,y:r}, {x:size-r,y:r}, {x:r,y:size-r}, {x:size-r,y:size-r}];
}
window.addEventListener('resize', resize);
resize();

function startGame(mode) {
    gameMode = mode;
    gameState = 'PLAYING';
    currentPlayer = 1;
    isTurnActive = false;
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    
    // Setup Pieces
    pucks = [];
    striker.r = BOARD_SIZE * 0.05;
    striker.color = currentSkin;
    resetStriker();
    
    // Create Pucks
    let cx = BOARD_SIZE/2, cy = BOARD_SIZE/2, pr = BOARD_SIZE*0.035;
    pucks.push({x:cx, y:cy, vx:0, vy:0, r:pr, color:'#ff0066', type:'queen', active:true});
    for(let i=0; i<8; i++) {
        let a = (i/8)*Math.PI*2, d = pr*2.1;
        pucks.push({
            x: cx+Math.cos(a)*d, y: cy+Math.sin(a)*d, 
            vx:0, vy:0, r:pr, active:true,
            color: i%2===0?'#eee':'#333', type: i%2===0?'white':'black'
        });
    }
    loop();
}

function resetStriker() {
    striker.vx = 0; striker.vy = 0;
    striker.x = BOARD_SIZE/2;
    striker.y = currentPlayer===1 ? BOARD_SIZE*0.85 : BOARD_SIZE*0.15;
}
function update() {
    if(gameState !== 'PLAYING') return;
    let moving = false;

    // Move Objects
    [striker, ...pucks].forEach(p => {
        if(!p.active && p !== striker) return;
        if(p.vx !== 0 || p.vy !== 0) {
            p.x += p.vx; p.y += p.vy;
            p.vx *= FRICTION; p.vy *= FRICTION;
            if(Math.abs(p.vx)<0.1 && Math.abs(p.vy)<0.1) { p.vx=0; p.vy=0; }
            else moving = true;
            
            // Walls
            if(p.x-p.r < 0) { p.x=p.r; p.vx *= -ELASTICITY; }
            if(p.x+p.r > BOARD_SIZE) { p.x=BOARD_SIZE-p.r; p.vx *= -ELASTICITY; }
            if(p.y-p.r < 0) { p.y=p.r; p.vy *= -ELASTICITY; }
            if(p.y+p.r > BOARD_SIZE) { p.y=BOARD_SIZE-p.r; p.vy *= -ELASTICITY; }

            // Pockets
            pockets.forEach(pkt => {
                if(Math.hypot(p.x-pkt.x, p.y-pkt.y) < BOARD_SIZE*0.07) {
                    p.vx=0; p.vy=0;
                    if(p === striker) { p.x = -1000; setTimeout(resetStriker, 500); }
                    else { p.active = false; p.x = -1000; checkWin(); }
                }
            });
        }
    });

    // Collisions
    let all = [striker, ...pucks].filter(p => p.active || p===striker);
    for(let i=0; i<all.length; i++) {
        for(let j=i+1; j<all.length; j++) {
            let p1=all[i], p2=all[j];
            let dist = Math.hypot(p1.x-p2.x, p1.y-p2.y);
            if(dist < p1.r+p2.r) {
                // Bounce logic
                let angle = Math.atan2(p2.y-p1.y, p2.x-p1.x);
                let speed1 = Math.hypot(p1.vx, p1.vy);
                let speed2 = Math.hypot(p2.vx, p2.vy);
                p1.vx -= Math.cos(angle) * 1; 
                p1.vy -= Math.sin(angle) * 1;
                p2.vx += Math.cos(angle) * 1;
                p2.vy += Math.sin(angle) * 1;
                // Simple push apart
                let lap = (p1.r+p2.r - dist) + 1;
                p2.x += Math.cos(angle)*lap; p2.y += Math.sin(angle)*lap;
            }
        }
    }

    if(!moving && isTurnActive) {
        isTurnActive = false;
        currentPlayer = currentPlayer===1?2:1;
        document.getElementById('turn-indicator').innerText = "Player "+currentPlayer;
        resetStriker();
        if(gameMode === 'ai' && currentPlayer === 2) setTimeout(aiTurn, 1000);
    }
}

function aiTurn() {
    let target = pucks.find(p => p.active);
    if(target) {
        let dx = target.x - striker.x, dy = target.y - striker.y;
        striker.vx = (dx/100)*15; striker.vy = (dy/100)*15;
        isTurnActive = true;
    }
}

// Input Handling
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    let r = canvas.getBoundingClientRect();
    let x = e.touches[0].clientX - r.left, y = e.touches[0].clientY - r.top;
    if(gameMode==='ai' && currentPlayer===2) return;
    if(Math.hypot(x-striker.x, y-striker.y) < striker.r*2) isDragging = true;
}, {passive:false});

canvas.addEventListener('touchend', e => {
    if(isDragging) {
        isDragging = false;
        let r = canvas.getBoundingClientRect();
        let x = e.changedTouches[0].clientX - r.left, y = e.changedTouches[0].clientY - r.top;
        striker.vx = (striker.x-x)*0.2; striker.vy = (striker.y-y)*0.2;
        isTurnActive = true;
    }
});

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Draw Pockets
    ctx.fillStyle='#111'; pockets.forEach(p=> {ctx.beginPath(); ctx.arc(p.x,p.y,BOARD_SIZE*0.07,0,7); ctx.fill();});
    // Draw Pieces
    [...pucks, striker].forEach(p => {
        if(!p.active && p!==striker) return;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.stroke();
    });
}
function loop() { update(); draw(); requestAnimationFrame(loop); }

// UI Helpers
function goToMenu() {
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    gameState = 'MENU';
}
function checkWin() {
    if(!pucks.some(p => p.active && p.type !== 'queen')) {
        alert("GAME OVER!"); goToMenu();
    }
}
function openShop() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('shop').classList.remove('hidden');
    let list = document.getElementById('shop-list'); list.innerHTML='';
    skins.forEach(s => {
        let btn = document.createElement('div');
        btn.className = `shop-item ${ownedSkins.includes(s.id)?'owned':''}`;
        btn.innerHTML = `${s.name}<br>${ownedSkins.includes(s.id)?'OWNED':s.price}`;
        btn.onclick = () => {
            if(ownedSkins.includes(s.id)) { currentSkin=s.color; localStorage.setItem('carrom_skin', s.color); alert("Equipped!"); }
            else if(coins >= s.price) {
                coins -= s.price; ownedSkins.push(s.id);
                localStorage.setItem('carrom_owned', JSON.stringify(ownedSkins));
                localStorage.setItem('carrom_coins', coins);
                openShop();
            }
        };
        list.appendChild(btn);
    });
}
function closeShop() {
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
}
