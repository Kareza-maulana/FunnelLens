import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Info, LoaderCircle, Search, X, AlertTriangle, Inbox } from 'lucide-react';

export function Logo({ compact = false }) { return <span className="logo"><span className="logo-mark"><i/><i/><i/></span>{!compact && 'FunnelLens'}</span>; }
export function Button({ children, variant = 'primary', className = '', loading = false, icon: Icon, type = 'button', ...props }) { return <button type={type} className={`btn btn-${variant} ${className}`} {...props} disabled={props.disabled || loading}>{loading ? <LoaderCircle size={17} className="spin"/> : Icon && <Icon size={17}/>}<span>{children}</span></button>; }
export function Badge({ children, color = 'blue', dot = false }) { return <span className={`badge badge-${color}`}>{dot && <i/>}{children}</span>; }
export function DemoBadge() { return <Badge color="blue" dot>DATA DEMO</Badge>; }
export function Panel({ children, className = '', ...props }) { return <section className={`panel ${className}`} {...props}>{children}</section>; }
export function SectionHead({ title, caption, action, icon: Icon }) { return <div className="section-head"><div><h2>{Icon && <Icon size={20}/>} {title}</h2>{caption && <p className="muted small">{caption}</p>}</div>{action}</div>; }
export function PageHead({ eyebrow, title, description, action }) { return <div className="page-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }
export function TextLink({ to, children, onClick, className = '' }) { return to ? <Link className={`text-link ${className}`} to={to}>{children}<ArrowRight size={15}/></Link> : <button type="button" className={`text-link ${className}`} onClick={onClick}>{children}<ArrowRight size={15}/></button>; }
export function Notice({ children, tone = 'blue', className = '' }) { const Icon = tone === 'amber' || tone === 'red' ? AlertTriangle : Info; return <div className={`notice notice-${tone} ${className}`}><Icon size={18}/><div>{children}</div></div>; }
export function Field({ label, error, hint, children, className = '', required = false }) { return <label className={`field ${error ? 'has-error' : ''} ${className}`}><span>{label}{required && <b className="required"> *</b>}</span>{children}{error ? <small className="error-text">{error}</small> : hint && <small>{hint}</small>}</label>; }
export function Input(props) { return <input className="input" {...props}/>; }
export function Select({ children, ...props }) { return <span className="select-wrap"><select className="input" {...props}>{children}</select><ChevronDown size={15}/></span>; }
export function Tabs({ options, value, onChange, label = 'Pilihan tampilan' }) { return <div className="tabs" role="tablist" aria-label={label}>{options.map(o => <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.icon && <o.icon size={17}/>} {o.label}{o.count !== undefined && <span>{o.count}</span>}</button>)}</div>; }
export function SearchInput({ value, onChange, placeholder = 'Cari…', ...props }) { return <div className="search-input"><Search size={17}/><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} {...props}/>{value && <button title="Hapus pencarian" type="button" onClick={() => onChange('')}><X size={14}/></button>}</div>; }
export function EmptyState({ title = 'Belum ada data pada pilihan ini', description = 'Ubah filter atau mulai dengan dataset contoh.', action, icon: Icon = Inbox }) { return <div className="empty-state"><span><Icon size={28}/></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function Pagination({ page, pages, onChange, total, size }) { return <div className="pagination"><span>{total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} dari ${total}` : '0 hasil'}</span><div><button aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={17}/></button>{Array.from({ length: Math.min(pages, 5) }, (_, i) => Math.min(Math.max(1, page - 2), Math.max(1, pages - 4)) + i).map(p => <button key={p} className={p === page ? 'active' : ''} onClick={() => onChange(p)}>{p}</button>)}<button aria-label="Halaman berikutnya" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={17}/></button></div></div>; }
export function ProgressBar({ value, color = 'blue', label, detail }) { return <div className="progress-row">{label && <span>{label}</span>}<div className="progress-track"><i className={`bg-${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }}/></div>{detail && <strong>{detail}</strong>}</div>; }
export function ProductImage({ source, className = '', alt = 'Sikat elektrik mini, contoh produk' }) { return <img className={`product-image ${className}`} src={source || '/product.png'} alt={alt} onError={e => { if (!e.currentTarget.src.endsWith('/product.png')) e.currentTarget.src = '/product.png'; }}/>; }
export function Modal({ open, onClose, title, children, footer, wide = false, drawer = false }) {
  const ref = useRef(), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => ref.current?.querySelector('button, input, select, textarea, [tabindex="0"]')?.focus(), 10);
    const handle = e => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const list = [...(ref.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || [])].filter(el => el.offsetParent !== null);
        if (!list.length) return;
        if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handle); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return createPortal(<div className={`modal-backdrop ${drawer ? 'drawer-backdrop' : ''}`} onMouseDown={e => e.target === e.currentTarget && onClose()}><div ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${drawer ? 'drawer' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="icon-btn" aria-label="Tutup" onClick={onClose}><X size={20}/></button></header><div className="modal-content">{children}</div>{footer && <footer>{footer}</footer>}</div></div>, document.body);
}
const ToastContext = createContext();
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]), timers = useRef([]);
  const toast = useCallback((message, tone = 'success') => { const id = Date.now() + Math.random(); setItems(v => [...v.slice(-3), { id, message, tone }]); timers.current.push(setTimeout(() => setItems(v => v.filter(t => t.id !== id)), 4200)); }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return <ToastContext.Provider value={toast}>{children}<div className="toasts" aria-live="polite">{items.map(t => <div className={`toast ${t.tone}`} key={t.id}>{t.tone === 'error' ? <AlertTriangle size={19}/> : <CheckCircle2 size={19}/>}<span>{t.message}</span><button aria-label="Tutup notifikasi" onClick={() => setItems(v => v.filter(v => v.id !== t.id))}><X size={15}/></button></div>)}</div></ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
export function CheckList({ items }) { return <div className="check-list">{items.map((item, i) => <div key={i}><Check size={17}/><span>{item}</span></div>)}</div>; }
export function ExportButton({ onClick, children = 'Ekspor CSV' }) { return <Button variant="secondary" icon={Download} onClick={onClick}>{children}</Button>; }
