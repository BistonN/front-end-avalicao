/* --- DADOS DAS PROVAS --- */
const API_URL = 'http://localhost:3000';
const TEMPO_PROVA_MIN = 180;
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

        fetch(`${API_URL}/form/${codigo}`)
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

let indiceRevisao = 0;

window.abrirRevisao = function() {
    indiceRevisao = 0;
    
    // Gerar botões de navegação
    const navGrid = document.getElementById('revisao-nav-grid');
    navGrid.innerHTML = '';
    
    provaAtual.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.className = 'q-nav-btn';
        btn.textContent = i + 1;
        btn.style.width = '40px';
        btn.style.height = '40px';
        
        // Verificar se acertou
        const respostasCorretasJSON = localStorage.getItem('respostas_corretas');
        let acertou = false;
        if(respostasCorretasJSON) {
            try {
                const dados = JSON.parse(respostasCorretasJSON);
                const item = dados.find(d => d.id_questao === q.id);
                if(item) {
                    acertou = item.resposta_aluno === item.resposta_certa;
                }
            } catch(e) {}
        }
        
        if(acertou) {
            btn.classList.add('answered');
        }
        
        btn.onclick = () => { indiceRevisao = i; renderizarRevisao(); };
        navGrid.appendChild(btn);
    });
    
    renderizarRevisao();
    document.getElementById('modal-revisao').style.display = 'flex';
};

window.fecharRevisao = function() {
    document.getElementById('modal-revisao').style.display = 'none';
};

window.revisaoNext = function() {
    if(indiceRevisao < provaAtual.length - 1) {
        indiceRevisao++;
        renderizarRevisao();
    }
};

window.revisaoPrev = function() {
    if(indiceRevisao > 0) {
        indiceRevisao--;
        renderizarRevisao();
    }
};

function renderizarRevisao() {
    const q = provaAtual[indiceRevisao];
    const idQuestao = q.id;
    
    // Buscar dados da resposta
    const respostasCorretasJSON = localStorage.getItem('respostas_corretas');
    let respostaAluno = respostas[indiceRevisao];
    let respostaCerta = q.correta;
    
    if(respostasCorretasJSON) {
        try {
            const dados = JSON.parse(respostasCorretasJSON);
            const item = dados.find(d => d.id_questao === idQuestao);
            if(item) {
                respostaAluno = item.resposta_aluno;
                respostaCerta = item.resposta_certa;
            }
        } catch(e) {}
    }
    
    const acertou = respostaAluno === respostaCerta;
    const opcoes = q.opcoes ? q.opcoes : [q.resposta_a, q.resposta_b, q.resposta_c, q.resposta_d, q.resposta_e].filter(o => o);
    
    let html = `
        <div style="background: ${acertou ? '#dcfce7' : '#fee2e2'}; border-left: 4px solid ${acertou ? 'var(--success)' : 'var(--danger)'}; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-icons-round" style="color: ${acertou ? 'var(--success)' : 'var(--danger)'}; font-size: 1.5rem;">
                    ${acertou ? 'check_circle' : 'cancel'}
                </span>
                <span style="font-weight: 600; color: ${acertou ? '#166534' : '#991b1b'};">
                    ${acertou ? 'Resposta Correta' : 'Resposta Incorreta'}
                </span>
            </div>
        </div>
        
        <h3 style="margin-bottom: 15px; font-size: 1.1rem;">Questão ${indiceRevisao + 1}</h3>
        <p style="margin-bottom: 20px; line-height: 1.6; color: var(--text-main);">${escaparHTML(q.pergunta || q.titulo)}</p>
        
        <div style="margin-bottom: 20px;">
            <span style="font-size: 0.9rem; color: var(--text-light); font-weight: 600; display: block; margin-bottom: 10px;">OPÇÕES</span>
    `;
    
    opcoes.forEach((texto, i) => {
        const letra = String.fromCharCode(65 + i);
        const isRespostaAluno = letra === respostaAluno;
        const isRespostaCerta = letra === respostaCerta;
        
        let bgColor = 'var(--bg-body)';
        let borderColor = 'var(--border)';
        let textColor = 'var(--text-main)';
        
        if(isRespostaCerta) {
            bgColor = '#dcfce7';
            borderColor = 'var(--success)';
            textColor = '#166534';
        } else if(isRespostaAluno && !acertou) {
            bgColor = '#fee2e2';
            borderColor = 'var(--danger)';
            textColor = '#991b1b';
        }
        
        let label = `<strong>${letra})</strong> ${escaparHTML(texto)}`;
        
        if(isRespostaCerta) {
            label += ` <span style="margin-left: 10px; font-weight: 600; color: var(--success);">✓ CORRETA</span>`;
        }
        if(isRespostaAluno && !acertou) {
            label += ` <span style="margin-left: 10px; font-weight: 600; color: var(--danger);">✗ SUA RESPOSTA</span>`;
        }
        
        html += `
            <div style="padding: 12px; border: 2px solid ${borderColor}; border-radius: 8px; margin-bottom: 8px; background: ${bgColor}; cursor: not-allowed;">
                <div style="color: ${textColor}; display: flex; align-items: center; gap: 10px;">
                    ${label}
                </div>
            </div>
        `;
    });
    
    html += `
        </div>
        
        <div style="background: var(--bg-body); padding: 15px; border-radius: 8px; border-left: 3px solid var(--primary);">
            <span style="font-weight: 600; color: var(--primary); display: block; margin-bottom: 8px;">Explicação:</span>
            <p style="color: var(--text-main); line-height: 1.6; margin: 0;">${escaparHTML(q.explicacao || 'Sem explicação disponível')}</p>
        </div>
    `;
    
    document.getElementById('revisao-questao-container').innerHTML = html;
    document.getElementById('revisao-info').textContent = `Questão ${indiceRevisao + 1} de ${provaAtual.length}`;
    
    // Atualizar navegação
    document.getElementById('revisao-nav-grid').querySelectorAll('.q-nav-btn').forEach((btn, i) => {
        if(i === indiceRevisao) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function escaparHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function adaptarURLGoogleDrive(url) {
    if(!url || typeof url !== 'string') return url;
    
    if(url.includes('drive.google.com')) {
        let match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        
        if(!match) {
            match = url.match(/id=([a-zA-Z0-9-_]+)/);
        }
        
        if(match && match[1]) {
            const id = match[1];
            return `https://lh3.googleusercontent.com/d/${id}=w1000`;
        }
    }
    return url;
}

function renderizarQuestao() {
    const q = provaAtual[indiceQuestao];
    
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
    
    const nomeAluno = localStorage.getItem('aluno_nome');
    const emailAluno = localStorage.getItem('aluno_email');
    const codigoProva = localStorage.getItem('prova_codigo');
    
    // Criar array de promessas para enviar todas as respostas
    const promessas = [];
    let token = localStorage.getItem('prova_token');
    
    provaAtual.forEach((q, indice) => {
        const respostaAluno = respostas[indice];
        
        // Apenas enviar se respondida
        if(respostaAluno) {
            const corpo = {
                id: q.id,
                nome: nomeAluno,
                email: emailAluno,
                resposta_aluno: respostaAluno
            };
            
            const promise = fetch(`${API_URL}/form/question/${codigoProva}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(corpo)
            })
            .then(response => response.json())
            .then(data => {
                console.log(`Questão ${q.id} enviada:`, data);
                // Salvar token da primeira resposta
                if(data.data && data.data.token && !token) {
                    token = data.data.token;
                    localStorage.setItem('prova_token', token);
                }
                return data;
            })
            .catch(error => {
                console.error(`Erro ao enviar questão ${q.id}:`, error);
                return null;
            });
            
            promessas.push(promise);
        }
    });
    
    // Aguardar todas as respostas serem enviadas
    Promise.all(promessas)
        .then(resultados => {
            console.log('Todas as respostas processadas');
            
            // Agora buscar as respostas corretas
            return buscarRespostasCorretas(nomeAluno, codigoProva);
        })
        .then(() => {
            localStorage.removeItem('prova_ativa');
            exibirResultado();
        })
        .catch(error => {
            console.error('Erro geral no envio:', error);
            localStorage.removeItem('prova_ativa');
            exibirResultado();
        });
}

function buscarRespostasCorretas(nomeAluno, codigoProva) {
    const corpo = {
        nome: nomeAluno
    };
    
    return fetch(`${API_URL}/form/questions/${codigoProva}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(corpo)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Respostas corretas obtidas:', data);
        
        // Salvar respostas corretas no localStorage
        if(data.results && Array.isArray(data.results)) {
            localStorage.setItem('respostas_corretas', JSON.stringify(data.results));
            // Salvar token se não foi salvo antes
            if(data.results[0] && data.results[0].token) {
                localStorage.setItem('prova_token', data.results[0].token);
            }
        }
        
        return data;
    })
    .catch(error => {
        console.error('Erro ao buscar respostas corretas:', error);
        throw error;
    });
}

function exibirResultado() {
    let acertos = 0;
    let feedback = '';
    
    // Tentar usar dados da API se disponível
    const respostasCorretasJSON = localStorage.getItem('respostas_corretas');
    let respostasCorretas = {};
    
    if(respostasCorretasJSON) {
        try {
            const dados = JSON.parse(respostasCorretasJSON);
            dados.forEach(item => {
                respostasCorretas[item.id_questao] = {
                    resposta_certa: item.resposta_certa,
                    resposta_aluno: item.resposta_aluno
                };
            });
        } catch(e) {
            console.error('Erro ao parsear respostas corretas:', e);
        }
    }
    
    provaAtual.forEach((q, i) => {
        const idQuestao = q.id;
        let userResp, correta, ok;
        
        if(respostasCorretas[idQuestao]) {
            // Dados da API
            userResp = respostasCorretas[idQuestao].resposta_aluno;
            correta = respostasCorretas[idQuestao].resposta_certa;
            ok = userResp === correta;
        } else {
            // Dados locais (fallback)
            userResp = respostas[i];
            correta = q.correta;
            ok = userResp === correta;
        }
        
        if(ok) acertos++;
        feedback += `<div class="fb-item ${ok ? 'correct' : 'wrong'}">
            <strong>Q${i+1})</strong> ${ok ? 'Correto!' : `Errou (Sua: ${userResp||'-'} | Certa: ${correta})`}
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