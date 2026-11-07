import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

const SUGGESTIONS = [
  'Qual foi o distrito com mais incêndios em 2021?',
  'Que concelhos tiveram mais área ardida em 2021?',
  'Quais os distritos mais afetados em 2015?',
];

const FlameIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
);

function ChatWidget() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const messagesContainer = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = messagesContainer.current;
    if (el && isOpen) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading, isOpen]);

  // Auto-resize the textarea up to a max height
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '';
    if (!inputText) return; // empty: let CSS (rows=1) decide
    const raf = requestAnimationFrame(() => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 110)}px`;
    });
    return () => cancelAnimationFrame(raf);
  }, [inputText, isOpen]);

  const sendMessage = async (override?: string) => {
    const trimmed = (override ?? inputText).trim();
    if (!trimmed || isLoading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Error bubbles are UI-only; never send them back to the model
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => !m.isError)
            .map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`Erro ${res.status}: ${errorData.error || 'Falha na comunicação'}`);
      }

      const data = await res.json();
      const reply: string = data.reply || data.message || 'Resposta vazia da API.';
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      setMessages([
        ...newMessages,
        { role: 'assistant', content: 'Ocorreu um erro ao contactar o assistente. Tenta novamente.', isError: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {!isOpen && (
        <button className="cw-fab" onClick={() => setIsOpen(true)} aria-label="Abrir SeverusBot" title="Abrir SeverusBot">
          <FlameIcon size={26} />
        </button>
      )}

      {isOpen && (
        <section className="cw-panel" role="dialog" aria-label="SeverusBot">
          <header className="cw-header">
            <div className="cw-avatar"><FlameIcon size={18} /></div>
            <div className="cw-heading">
              <div className="cw-title">SeverusBot</div>
              <div className="cw-subtitle"><span className="cw-status" />Incêndios florestais · Portugal</div>
            </div>
            {messages.length > 0 && (
              <button className="cw-icon-btn" onClick={() => setMessages([])} title="Nova conversa" aria-label="Nova conversa">
                <TrashIcon />
              </button>
            )}
            <button className="cw-icon-btn" onClick={() => setIsOpen(false)} title="Fechar" aria-label="Fechar">
              <CloseIcon />
            </button>
          </header>

          <div className="cw-messages" ref={messagesContainer}>
            {messages.length === 0 && (
              <div className="cw-welcome">
                <div className="cw-welcome-icon"><FlameIcon size={28} /></div>
                <div className="cw-welcome-title">Olá! Sou o SeverusBot</div>
                <p>Respondo com base nos relatórios provisórios do ICNF (2010–2024). Inclui o ano na pergunta para respostas mais precisas.</p>
                <div className="cw-chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="cw-chip" onClick={() => sendMessage(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={`${i}-${msg.role}`} className={`cw-row ${msg.role}`}>
                {msg.role === 'assistant' && <div className="cw-mini-avatar"><FlameIcon size={14} /></div>}
                <div className={`cw-bubble ${msg.role}${msg.isError ? ' error' : ''}`}>
                  {msg.role === 'assistant' && !msg.isError ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="cw-row assistant">
                <div className="cw-mini-avatar"><FlameIcon size={14} /></div>
                <div className="cw-bubble assistant cw-typing" aria-label="A escrever">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <div className="cw-input-bar">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunta sobre incêndios florestais…"
              disabled={isLoading}
            />
            <button
              className="cw-send"
              onClick={() => sendMessage()}
              disabled={isLoading || !inputText.trim()}
              title="Enviar"
              aria-label="Enviar mensagem"
            >
              <SendIcon />
            </button>
          </div>
        </section>
      )}

      <style>{`
        .cw-fab, .cw-panel, .cw-panel * { box-sizing: border-box; }
        .cw-fab, .cw-panel {
          font-family: 'Inter', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .cw-fab {
          position: fixed; right: 20px; bottom: 20px; z-index: 10000;
          width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #fff; background: linear-gradient(135deg, #f97316, #ea580c);
          box-shadow: 0 10px 30px rgba(0,0,0,0.45), 0 0 0 4px rgba(249,115,22,0.18);
          transition: transform .2s ease, box-shadow .2s ease;
        }
        .cw-fab:hover { transform: scale(1.06); }

        .cw-panel {
          position: fixed; right: 20px; bottom: 20px; z-index: 10000;
          width: 390px; height: min(580px, calc(100vh - 40px));
          display: flex; flex-direction: column; overflow: hidden;
          background: #0f172a; color: #f1f5f9;
          border: 1px solid #1f2937; border-radius: 16px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.55);
          animation: cw-pop .22s ease-out;
        }

        .cw-header {
          display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px;
          background: linear-gradient(135deg, #1e293b, #111827);
          border-bottom: 1px solid #1f2937;
        }
        .cw-avatar {
          width: 34px; height: 34px; border-radius: 10px; flex: none;
          display: flex; align-items: center; justify-content: center; color: #fff;
          background: linear-gradient(135deg, #f97316, #ea580c);
        }
        .cw-heading { flex: 1; min-width: 0; }
        .cw-title { font-weight: 600; font-size: .95rem; line-height: 1.2; }
        .cw-subtitle { display: flex; align-items: center; gap: 6px; font-size: .72rem; color: #94a3b8; margin-top: 2px; }
        .cw-status { width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.2); }
        .cw-icon-btn {
          background: transparent; border: none; color: #94a3b8; cursor: pointer;
          width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          transition: background .15s, color .15s;
        }
        .cw-icon-btn:hover { background: #334155; color: #f1f5f9; }

        .cw-messages {
          flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 12px;
          scrollbar-width: thin; scrollbar-color: #334155 transparent;
        }

        .cw-welcome { text-align: center; padding: 14px 6px 4px; color: #94a3b8; font-size: .84rem; line-height: 1.5; }
        .cw-welcome-icon {
          width: 52px; height: 52px; margin: 0 auto 10px; border-radius: 16px; color: #fff;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #f97316, #ea580c); box-shadow: 0 8px 24px rgba(249,115,22,.3);
        }
        .cw-welcome-title { color: #f1f5f9; font-weight: 600; font-size: 1rem; margin-bottom: 4px; }
        .cw-welcome p { margin: 0 0 14px; }
        .cw-chips { display: flex; flex-direction: column; gap: 8px; }
        .cw-chip {
          text-align: left; padding: 10px 12px; border-radius: 10px; cursor: pointer;
          background: #1e293b; border: 1px solid #334155; color: #e2e8f0; font: inherit; font-size: .82rem;
          transition: border-color .15s, background .15s, transform .15s;
        }
        .cw-chip:hover { border-color: #f97316; background: #243247; transform: translateY(-1px); }

        .cw-row { display: flex; gap: 8px; align-items: flex-end; animation: cw-in .22s ease-out; }
        .cw-row.user { justify-content: flex-end; }
        .cw-mini-avatar {
          width: 24px; height: 24px; border-radius: 8px; flex: none; color: #fff;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #f97316, #ea580c);
        }

        .cw-bubble {
          max-width: 82%; padding: 9px 13px; font-size: .88rem; line-height: 1.5;
          overflow-wrap: anywhere; white-space: pre-wrap;
        }
        .cw-bubble.user {
          color: #fff; border-radius: 16px 16px 4px 16px;
          background: linear-gradient(135deg, #f97316, #ea580c);
        }
        .cw-bubble.assistant {
          color: #e2e8f0; background: #1e293b; border: 1px solid #2b3a52; border-radius: 16px 16px 16px 4px;
          white-space: normal;
        }
        .cw-bubble.error { color: #fecaca; background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.4); }

        /* Markdown inside assistant bubbles */
        .cw-bubble.assistant > :first-child { margin-top: 0; }
        .cw-bubble.assistant > :last-child { margin-bottom: 0; }
        .cw-bubble.assistant p { margin: 0 0 8px; }
        .cw-bubble.assistant strong { color: #fff; font-weight: 600; }
        .cw-bubble.assistant ul, .cw-bubble.assistant ol { margin: 4px 0 8px; padding-left: 20px; }
        .cw-bubble.assistant li { margin: 2px 0; }
        .cw-bubble.assistant h1, .cw-bubble.assistant h2, .cw-bubble.assistant h3 {
          font-size: .95rem; font-weight: 600; margin: 10px 0 6px; color: #fff;
        }
        .cw-bubble.assistant code {
          font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; font-size: .8rem;
          background: #0b1220; padding: 1px 5px; border-radius: 5px;
        }
        .cw-bubble.assistant pre { background: #0b1220; padding: 10px; border-radius: 8px; overflow-x: auto; margin: 6px 0; }
        .cw-bubble.assistant pre code { background: none; padding: 0; }
        .cw-bubble.assistant a { color: #38bdf8; }
        .cw-bubble.assistant blockquote { margin: 6px 0; padding-left: 10px; border-left: 3px solid #f97316; color: #94a3b8; }
        .cw-bubble.assistant table { border-collapse: collapse; font-size: .8rem; margin: 6px 0; display: block; overflow-x: auto; }
        .cw-bubble.assistant th, .cw-bubble.assistant td { border: 1px solid #334155; padding: 4px 8px; text-align: left; }
        .cw-bubble.assistant th { background: #0b1220; }

        .cw-typing { display: flex; align-items: center; gap: 4px; padding: 13px 14px; }
        .cw-typing span { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: cw-bounce 1.2s infinite; }
        .cw-typing span:nth-child(2) { animation-delay: .15s; }
        .cw-typing span:nth-child(3) { animation-delay: .3s; }

        .cw-input-bar {
          display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px 12px;
          background: #111827; border-top: 1px solid #1f2937;
        }
        .cw-input-bar textarea {
          flex: 1; resize: none; max-height: 110px; padding: 10px 14px; border-radius: 14px;
          background: #1e293b; color: #f1f5f9; border: 1px solid #334155; outline: none;
          font: inherit; font-size: .88rem; line-height: 1.4; transition: border-color .15s, box-shadow .15s;
        }
        .cw-input-bar textarea::placeholder { color: #64748b; }
        .cw-input-bar textarea:focus { border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,.18); }
        .cw-input-bar textarea:disabled { opacity: .6; }
        .cw-send {
          width: 40px; height: 40px; flex: none; border: none; border-radius: 12px; cursor: pointer; color: #fff;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #f97316, #ea580c); transition: transform .15s, opacity .15s;
        }
        .cw-send:hover:not(:disabled) { transform: scale(1.06); }
        .cw-send:disabled { opacity: .4; cursor: not-allowed; }

        @keyframes cw-pop { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes cw-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes cw-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }

        @media (max-width: 480px) {
          .cw-panel { right: 10px; left: 10px; bottom: 10px; width: auto; height: min(600px, calc(100vh - 20px)); }
          .cw-fab { right: 14px; bottom: 14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cw-panel, .cw-row, .cw-typing span { animation: none; }
        }
      `}</style>
    </>
  );
}

export default ChatWidget;
