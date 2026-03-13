/* --- DADOS DAS PROVAS --- */
const TEMPO_PROVA_MIN = 40;
let provaAtual = [];
let indiceQuestao = 0;
let respostas = {};
let revisao = new Set();
let timerInterval;

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');

    const toggleBtns = document.querySelectorAll('#theme-toggle, #theme-toggle-exam, .login-theme-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    });

    if (document.getElementById('login-form')) initLogin();
    if (document.getElementById('real-content')) initProva();
});

// --- LOGIN ---
function initLogin() {
    localStorage.removeItem('prova_ativa');
    
    // Configurar navegação entre inputs de código
    const codeInputs = document.querySelectorAll('.code-input');
    codeInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if(e.target.value) {
                e.target.value = e.target.value.toUpperCase();
                if(index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                }
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if(e.key === 'Backspace' && !e.target.value && index > 0) {
                codeInputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const texto = (e.clipboardData || window.clipboardData).getData('text').toUpperCase();
            
            // Distribuir caracteres nos inputs
            for (let i = 0; i < Math.min(texto.length, codeInputs.length); i++) {
                codeInputs[i].value = texto[i];
            }
            
            // Focar no último input preenchido
            const ultimoIndex = Math.min(texto.length - 1, codeInputs.length - 1);
            codeInputs[ultimoIndex].focus();
        });
    });

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const codigo = Array.from(codeInputs)
            .map(input => input.value.trim().toUpperCase())
            .join('');
        const nome = document.getElementById('student-name').value.trim();
        const email = document.getElementById('student-email').value.trim();

        // Validar se todos os inputs estão preenchidos
        const todosPreenchidos = Array.from(codeInputs).every(input => input.value.trim());
        if (!todosPreenchidos) { alert("Preencha todos os campos do código."); return; }
        if (codigo.length !== 6) { alert("Código deve ter exatamente 6 caracteres."); return; }

        // Salvar no localStorage
        localStorage.setItem('aluno_nome', nome);
        localStorage.setItem('aluno_email', email);
        localStorage.setItem('prova_codigo', codigo);

        // Requisição para buscar questões
        const button = document.getElementById('submit-btn');
        button.disabled = true;
        button.textContent = 'Carregando...';

        fetch(`http://localhost:3069/form/${codigo}`)
            .then(response => response.json())
            .then(data => {
                if (data.results && Array.isArray(data.results)) {
                    localStorage.setItem('prova_questoes', JSON.stringify(data.results));
                    localStorage.setItem('prova_ativa', 'true');
                    localStorage.removeItem('respostas');
                    localStorage.removeItem('tempo_fim');
                    window.location.href = 'prova.html';
                } else {
                    alert("Erro: Formato de resposta inválido.");
                    button.disabled = false;
                    button.innerHTML = 'Iniciar Avaliação <span class="material-icons-round">arrow_forward</span>';
                }
            })
            .catch(error => {
                console.error('Erro na requisição:', error);
                alert("Erro ao buscar a prova. Verifique o código informado.");
                button.disabled = false;
                button.innerHTML = 'Iniciar Avaliação <span class="material-icons-round">arrow_forward</span>';
            });
    });
}

// --- PROVA ---
function initProva() {
    if(localStorage.getItem('prova_ativa') !== 'true') { window.location.href = 'index.html'; return; }

    const codigo = localStorage.getItem('prova_codigo');
    
    // Tentar buscar questões da API primeiro, senão usar dados locais
    const questoesAPI = localStorage.getItem('prova_questoes');
    if (questoesAPI) {
        provaAtual = JSON.parse(questoesAPI);
    } else if (bancosDeProvas[codigo]) {
        provaAtual = bancosDeProvas[codigo];
    } else {
        window.location.href = 'index.html';
        return;
    }

    respostas = JSON.parse(localStorage.getItem('respostas')) || {};
    
    document.getElementById('user-name').textContent = localStorage.getItem('aluno_nome');
    
    document.getElementById('real-content').style.display = 'none';
    document.getElementById('skeleton-screen').style.display = 'block';
    setTimeout(() => {
        document.getElementById('skeleton-screen').style.display = 'none';
        document.getElementById('real-content').style.display = 'block';
    }, 800);

    configurarTimer();
    renderizarQuestao();
    gerarNavegacao();
    configurarEventosProva();
    setupAtalhos();
}

function escaparHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function adaptarURLGoogleDrive(url) {
    if(!url || typeof url !== 'string') return url;
    
    // Verifica se é URL do Google Drive
    if(url.includes('drive.google.com')) {
        // Extrai o ID do arquivo com várias variações possíveis
        let match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        
        if(!match) {
            match = url.match(/id=([a-zA-Z0-9-_]+)/);
        }
        
        if(match && match[1]) {
            const id = match[1];
            // Retornar URL em formato que funciona melhor
            return `https://lh3.googleusercontent.com/d/${id}=w1000`;
        }
    }
    return url;
}

function renderizarQuestao() {
    const q = provaAtual[indiceQuestao];
    
    // Adaptar para API (resposta_a, resposta_b, etc.) ou dados locais (opcoes)
    const opcoes = q.opcoes ? q.opcoes : [q.resposta_a, q.resposta_b, q.resposta_c, q.resposta_d, q.resposta_e].filter(o => o);
    const titulo = q.pergunta || q.titulo;
    const imagem = q.imagem || q.url_anexo;
    const disciplina = q.disciplina || 'Questão';
    
    document.getElementById('q-badge').textContent = disciplina;
    document.getElementById('q-title').textContent = `Questão ${indiceQuestao + 1}`;
    document.getElementById('q-text').textContent = titulo;

    const imgArea = document.getElementById('q-image-area');
    const imgElement = document.getElementById('q-image');
    if(imagem && imagem !== null && imagem !== '') {
        let imagemAdaptada = adaptarURLGoogleDrive(imagem);
        
        console.log('URL Original:', imagem);
        console.log('URL Adaptada:', imagemAdaptada);
        
        // Mostrar por padrão e esconder apenas se houver erro
        imgArea.style.display = 'block';
        
        imgElement.onerror = function() {
            imgArea.style.display = 'none';
            console.error('Erro ao carregar imagem. URL:', imagemAdaptada);
        };
        
        imgElement.src = imagemAdaptada;
    } else { imgArea.style.display = 'none'; }
    
    const container = document.getElementById('options-box');
    container.innerHTML = '';

    opcoes.forEach((texto, i) => {
        const letra = String.fromCharCode(65 + i);
        const checked = respostas[indiceQuestao] === letra ? 'checked' : '';
        
        container.innerHTML += `
            <div class="option-wrapper">
                <input type="radio" name="opcao" id="opt-${i}" class="option-input" value="${letra}" ${checked} onchange="salvar('${letra}')">
                <label class="option-label" for="opt-${i}">
                    <div class="circle"></div>
                    <strong>${letra})</strong>&nbsp; ${escaparHTML(texto)}
                </label>
            </div>
        `;
    });

    document.getElementById('btn-prev').disabled = indiceQuestao === 0;
    const isLast = indiceQuestao === provaAtual.length - 1;
    document.getElementById('btn-next').style.display = isLast ? 'none' : 'block';
    document.getElementById('btn-finish').style.display = isLast ? 'block' : 'none';

    const btnRev = document.getElementById('btn-review');
    if(revisao.has(indiceQuestao)) {
        btnRev.classList.add('active');
        btnRev.innerHTML = '<span class="material-icons-round">flag</span> Revisar (Marcado)';
    } else {
        btnRev.classList.remove('active');
        btnRev.innerHTML = '<span class="material-icons-round">flag</span> Revisar';
    }
    atualizarSidebar();
}

function salvar(letra) {
    respostas[indiceQuestao] = letra;
    localStorage.setItem('respostas', JSON.stringify(respostas));
    atualizarSidebar();
}

function gerarNavegacao() {
    const grid = document.getElementById('nav-grid');
    grid.innerHTML = '';
    provaAtual.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.className = 'q-nav-btn';
        btn.textContent = i + 1;
        btn.onclick = () => { indiceQuestao = i; renderizarQuestao(); };
        grid.appendChild(btn);
    });
    atualizarSidebar();
}

function atualizarSidebar() {
    document.querySelectorAll('.q-nav-btn').forEach((btn, i) => {
        btn.className = 'q-nav-btn';
        if(i === indiceQuestao) btn.classList.add('active');
        if(respostas[i]) btn.classList.add('answered');
        if(revisao.has(i)) btn.classList.add('review');
    });
}

function configurarTimer() {
    const display = document.getElementById('timer');
    let fim = localStorage.getItem('tempo_fim');
    if(!fim) {
        fim = new Date().getTime() + TEMPO_PROVA_MIN * 60000;
        localStorage.setItem('tempo_fim', fim);
    }
    timerInterval = setInterval(() => {
        const resto = fim - new Date().getTime();
        if(resto <= 0) { clearInterval(timerInterval); finalizar(); return; }
        const m = Math.floor(resto / 60000);
        const s = Math.floor((resto % 60000) / 1000);
        display.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        if(m < 5) document.querySelector('.timer-badge').classList.add('urgent');
    }, 1000);
}

function setupAtalhos() {
    document.addEventListener('keydown', (e) => {
        if(document.querySelector('.modal-overlay[style*="flex"]')) return;
        if(e.key === 'ArrowRight' && indiceQuestao < provaAtual.length - 1) { indiceQuestao++; renderizarQuestao(); }
        if(e.key === 'ArrowLeft' && indiceQuestao > 0) { indiceQuestao--; renderizarQuestao(); }
        const key = e.key.toUpperCase();
        if(['A','B','C','D','E'].includes(key)) {
            const inputs = document.querySelectorAll('input[name="opcao"]');
            inputs.forEach(input => { if(input.value === key) input.click(); });
        }
    });
}

function configurarEventosProva() {
    document.getElementById('btn-next').onclick = () => { indiceQuestao++; renderizarQuestao(); };
    document.getElementById('btn-prev').onclick = () => { indiceQuestao--; renderizarQuestao(); };
    document.getElementById('btn-clear').onclick = () => { delete respostas[indiceQuestao]; salvar(null); renderizarQuestao(); };
    document.getElementById('btn-review').onclick = () => {
        if(revisao.has(indiceQuestao)) revisao.delete(indiceQuestao);
        else revisao.add(indiceQuestao);
        renderizarQuestao();
    };
    
    document.getElementById('btn-finish').onclick = confirmarFinalizacao;
    
    document.getElementById('focus-mode-toggle').onclick = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else if (document.exitFullscreen) document.exitFullscreen();
    };
    
    const sidebar = document.querySelector('.sidebar');
    document.getElementById('menu-toggle').onclick = () => sidebar.classList.add('open');
    document.getElementById('close-menu').onclick = () => sidebar.classList.remove('open');
}

function confirmarFinalizacao() {
    const respondidas = Object.values(respostas).filter(r => r).length;
    const total = provaAtual.length;
    if (respondidas < total) {
        const faltam = total - respondidas;
        document.getElementById('aviso-texto').textContent = `Você tem ${faltam} questão(ões) em aberto.`;
        document.getElementById('modal-aviso').style.display = 'flex';
    } else {
        finalizar();
    }
}

window.fecharModalAviso = () => document.getElementById('modal-aviso').style.display = 'none';
window.confirmarEFinalizar = () => { fecharModalAviso(); finalizar(); };

function finalizar() {
    clearInterval(timerInterval);
    localStorage.removeItem('prova_ativa');
    
    let acertos = 0;
    let feedback = '';
    
    provaAtual.forEach((q, i) => {
        const userResp = respostas[i];
        const ok = userResp === q.correta;
        if(ok) acertos++;
        feedback += `<div class="fb-item ${ok ? 'correct' : 'wrong'}">
            <strong>Q${i+1})</strong> ${ok ? 'Correto!' : `Errou (Sua: ${userResp||'-'} | Certa: ${q.correta})`}
            <div style="font-size:0.85rem; margin-top:4px; color:#555">${q.explicacao || ''}</div>
        </div>`;
    });

    document.getElementById('final-score').textContent = `${acertos} / ${provaAtual.length}`;
    document.getElementById('feedback-area').innerHTML = feedback;
    document.getElementById('msg-resultado').textContent = acertos >= provaAtual.length/2 ? "Aprovado!" : "Reprovado";
    document.getElementById('modal-resultado').style.display = 'flex';

    if(acertos >= provaAtual.length/2) {
        document.getElementById('btn-download-pdf').style.display = 'block';
        dispararConfetes();
    }

    const ctx = document.getElementById('scoreChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Acertos', 'Erros'],
            datasets: [{ data: [acertos, provaAtual.length - acertos], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function dispararConfetes() {
    const end = Date.now() + 3000;
    (function frame() {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#005caa', '#22c55e'] });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#005caa', '#22c55e'] });
        if (Date.now() < end) requestAnimationFrame(frame);
    }());
}

function gerarCertificado() {
    const nome = localStorage.getItem('aluno_nome');
    const curso = localStorage.getItem('prova_codigo');
    const nota = document.getElementById('final-score').textContent;
    
    document.getElementById('cert-name').textContent = nome.toUpperCase();
    document.getElementById('cert-course').textContent = curso;
    document.getElementById('cert-score').textContent = nota;
    document.getElementById('cert-date').textContent = new Date().toLocaleDateString('pt-BR');
    
    const element = document.getElementById('certificate-template');
    element.style.display = 'flex'; 
    
    const opt = {
        margin: 10,
        filename: `Certificado_SENAI_${nome.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true }, 
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        element.style.display = 'none';
    });
}

function sair() {
    localStorage.clear();
    window.location.href = 'index.html';
}