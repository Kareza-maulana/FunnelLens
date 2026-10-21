import React from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Check, MousePointer2, ScanSearch, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui.jsx';

const features = [
  { no: '01', icon: ScanSearch, title: 'Temukan titik yang bocor', text: 'Lihat perjalanan orang dari iklan sampai pembelian. Ketahui tahap mana yang membuat calon pelanggan berhenti.' },
  { no: '02', icon: BarChart3, title: 'Baca performa dengan utuh', text: 'Satukan cerita campaign, audiens, dan creative supaya angka punya konteks yang bisa dipakai.' },
  { no: '03', icon: Sparkles, title: 'Tentukan langkah berikutnya', text: 'Ubah temuan menjadi prioritas yang jelas—apa yang perlu diperbaiki, diuji, atau diteruskan.' },
];

export default function Landing() {
  const scrollToStory = () => document.getElementById('cara-kerja')?.scrollIntoView({ behavior: 'smooth' });
  return <main className="landing-page">
    <header className="landing-nav">
      <Link to="/" aria-label="FunnelLens, beranda"><Logo/></Link>
      <nav aria-label="Navigasi halaman"><button onClick={scrollToStory}>Cara kerja</button><a href="https://undraw.co/illustration/business-analytics_y8m6" target="_blank" rel="noreferrer">Tentang visual</a></nav>
      <Link className="landing-nav-cta" to="/login">Masuk <ArrowUpRight size={16}/></Link>
    </header>

    <section className="landing-hero">
      <div className="landing-copy">
        <span className="landing-kicker"><i/> PANDANGAN YANG LEBIH JELAS TENTANG PERTUMBUHAN</span>
        <h1>Marketing-mu jalan. <em>Tapi ke mana?</em></h1>
        <p className="landing-lede">FunnelLens membantu tim marketing melihat apa yang terjadi di setiap tahap funnel—dan memilih langkah yang paling masuk akal sesudahnya.</p>
        <div className="landing-actions"><Link className="landing-primary" to="/login">Kenali FunnelLens <ArrowRight size={17}/></Link><button className="landing-secondary" onClick={scrollToStory}><span><ArrowDown size={15}/></span> Lihat cara kerjanya</button></div>
        <div className="landing-proof"><div className="proof-spark">✳</div><span>Dibuat untuk mengubah banyak metrik<br/>menjadi satu cerita yang mudah dibaca.</span></div>
      </div>
      <div className="landing-visual-wrap" aria-label="Ilustrasi analitik bisnis">
        <div className="landing-visual-note">Dari klik pertama<br/>sampai dampak bisnis <span>↘</span></div>
        <div className="landing-visual"><img src="https://cdn.undraw.co/illustrations/business-analytics_y8m6.svg" alt="Ilustrasi seseorang meninjau data dan grafik bisnis"/></div>
        <div className="landing-kpi-card"><span className="kpi-label"><i/> PERJALANAN CAMPAIGN</span><div className="kpi-main"><strong>Lebih terlihat.</strong><span>Setiap langkah punya konteks.</span></div><div className="kpi-bars" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="kpi-foot"><span>Awareness</span><span>Conversion</span><b>↗</b></div></div>
        <div className="landing-doodle">bukan sekadar<br/><u>dashboard</u></div>
      </div>
      <div className="landing-index">01 <span/> PRODUK OVERVIEW</div>
    </section>

    <section className="landing-story" id="cara-kerja">
      <div className="story-heading"><span className="landing-kicker">ANGKA PERLU CERITA</span><h2>Satu tampilan.<br/><em>Banyak keputusan lebih baik.</em></h2><p>Ketika data tersebar, sulit tahu apa yang benar-benar mendorong hasil. FunnelLens merapikannya ke dalam gambaran yang bisa ditindaklanjuti.</p></div>
      <div className="story-margin-note"><MousePointer2 size={17}/> Mulai dari pertanyaan,<br/>bukan dari spreadsheet.</div>
      <div className="feature-list">{features.map(({ no, icon: Icon, title, text }) => <article className="feature-row" key={no}><span className="feature-no">{no}</span><span className="feature-icon"><Icon size={19}/></span><div><h3>{title}</h3><p>{text}</p></div><ArrowUpRight className="feature-arrow" size={19}/></article>)}</div>
    </section>

    <section className="landing-closer"><div className="closer-mark">F<span>.</span></div><div><span className="landing-kicker">MULAI DENGAN GAMBARAN YANG LEBIH UTUH</span><h2>Siap melihat funnel-mu<br/><em>dengan cara berbeda?</em></h2></div><Link to="/login" className="landing-primary">Masuk ke workspace <ArrowRight size={17}/></Link></section>
    <footer className="landing-footer"><Link to="/"><Logo/></Link><span>FunnelLens · Pahami funnel. Pilih langkah berikutnya.</span><span>Ilustrasi oleh <a href="https://undraw.co/illustration/business-analytics_y8m6" target="_blank" rel="noreferrer">unDraw</a></span></footer>
  </main>;
}
