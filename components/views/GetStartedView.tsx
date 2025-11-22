import React, { useState, useCallback } from 'react';
import { 
    CheckCircleIcon, XIcon, InformationCircleIcon, KeyIcon, CreditCardIcon, LightbulbIcon,
    ImageIcon, VideoIcon, MegaphoneIcon, RobotIcon, LibraryIcon, SettingsIcon,
    GalleryIcon, AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon
} from '../Icons';
// FIX: Add missing Language type for component props.
import { type Language } from '../../types';


// --- Video Slideshow Data ---
// User: You can replace the title and src for each video below.
// Place your video files in a 'public/videos' folder if they don't exist.
const slideshowVideos = [
  {
    title: "Video 1: Platform Overview",
    src: "https://monoklix.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.36-PM.mp4",
  },
  {
    title: "Video 2: AI Image Suite",
    src: "https://monoklix.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.37-PM.mp4",
  },
  {
    title: "Video 3: AI Video Suite",
    src: "https://monoklix.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.37-PM-1.mp4",
  },
  {
    title: "Video 4: Content Ideas",
    src: "https://monoklix.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.36-PM-1.mp4",
  },
  {
    title: "Video 5: Prompt Gallery",
    src: "https://monoklix.com/wp-content/uploads/2025/11/WhatsApp-Video-2025-11-13-at-10.41.37-PM-2.mp4",
  },
];


const Section: React.FC<{ title: string; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }> = ({ title, children, icon: Icon }) => (
    <div className="py-6 border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
        <h3 className="text-xl font-bold text-neutral-800 dark:text-white mb-4 sm:text-2xl flex items-center gap-3">
            {Icon && <Icon className="w-6 h-6 text-primary-500 flex-shrink-0" />}
            {title}
        </h3>
        <div className="space-y-4 text-neutral-600 dark:text-neutral-300">{children}</div>
    </div>
);

const SubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-6">
        <h4 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">{title}</h4>
        <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </div>
);

interface GetStartedViewProps {
    // FIX: Add missing 'language' prop to satisfy component signature in App.tsx.
    language: Language;
}

const GetStartedView: React.FC<GetStartedViewProps> = () => {
    const [currentSlide, setCurrentSlide] = useState(0);

    const nextSlide = useCallback(() => {
        setCurrentSlide(prev => (prev === slideshowVideos.length - 1 ? 0 : prev + 1));
    }, []);

    const prevSlide = useCallback(() => {
        setCurrentSlide(prev => (prev === 0 ? slideshowVideos.length - 1 : prev - 1));
    }, []);

    const goToSlide = (index: number) => {
        setCurrentSlide(index);
    };


    return (
        <div className="max-w-7xl mx-auto">
            {/* Video Slideshow Section */}
            <div className="mb-10 bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4 text-neutral-800 dark:text-white">Video Tutorials</h2>
                <div className="relative group">
                    <video 
                        key={slideshowVideos[currentSlide].src} 
                        src={slideshowVideos[currentSlide].src} 
                        controls 
                        autoPlay 
                        muted 
                        loop 
                        playsInline
                        className="w-full aspect-video rounded-md bg-black shadow-inner"
                    />
                    
                    {/* Navigation Buttons */}
                    <button 
                        onClick={prevSlide} 
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
                        aria-label="Previous video"
                    >
                        <ChevronLeftIcon className="w-6 h-6"/>
                    </button>
                    <button 
                        onClick={nextSlide} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
                        aria-label="Next video"
                    >
                        <ChevronRightIcon className="w-6 h-6"/>
                    </button>
                </div>
                <div className="mt-4 text-center">
                    <h3 className="font-bold text-neutral-800 dark:text-white">{slideshowVideos[currentSlide].title}</h3>
                    
                    {/* Slide Indicators */}
                    <div className="flex justify-center gap-2 mt-3">
                        {slideshowVideos.map((_, index) => (
                            <button 
                                key={index} 
                                onClick={() => goToSlide(index)}
                                className={`w-3 h-3 rounded-full transition-colors ${currentSlide === index ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400'}`}
                                aria-label={`Go to video ${index + 1}`}
                            />
                        ))}
                    </div>
                </div>
            </div>


            <div className="text-left mb-10">
                <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-white sm:text-4xl">
                    Panduan Mula
                </h1>
                <p className="mt-3 text-lg text-neutral-500 dark:text-neutral-400">
                    Panduan komprehensif anda untuk menguasai platform AI MONOklix.com.
                </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 p-6 sm:p-8 rounded-lg shadow-lg">

                <Section title="Gambaran Keseluruhan: Cara MONOklix Berfungsi" icon={InformationCircleIcon}>
                    <p>Sebelum anda bermula, penting untuk memahami dua bahagian perkhidmatan kami. Fikirkan platform kami seperti kereta berprestasi tinggi:</p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Platform MONOklix adalah kereta:</strong> Akaun anda memberi anda akses kepada papan pemuka, alatan (seperti Suite Imej dan Video), dan garaj (Galeri anda). Anda berada di tempat duduk pemandu.</li>
                      <li><strong>Token MONOklix adalah "bahan api":</strong> Untuk membuat kereta bergerak (untuk menjana kandungan), anda memerlukan bahan api. Ini disediakan oleh enjin AI Google yang berkuasa, dan ia memerlukan **Token** untuk diakses.</li>
                    </ul>
                    <p>Panduan ini akan menerangkan bagaimana "bahan api" disediakan secara automatik dan bagaimana perkhidmatan ini berfungsi.</p>
                </Section>

                <Section title="Bab 1: Akaun & Token" icon={KeyIcon}>
                    <SubSection title="Cara Log Masuk">
                        <p>Platform ini menggunakan sistem log masuk yang mudah dan tanpa kata laluan. Hanya masukkan alamat e-mel yang anda gunakan untuk pendaftaran di laman web utama kami dan klik 'Log Masuk'. Sesi anda akan disimpan secara automatik.</p>
                    </SubSection>
                    <SubSection title="Token: Automatik Sepenuhnya!">
                        <p className="font-semibold text-green-600 dark:text-green-400">Berita baik: Anda tidak perlu mendapatkan atau mengurus token anda sendiri.</p>
                        <p>Platform MONOklix menguruskan semuanya untuk anda. Apabila anda log masuk, sistem secara automatik memuatkan token pusat yang dikongsi yang memberi anda akses kepada semua ciri AI. Anda boleh mengesahkan token itu aktif dengan mencari ikon <KeyIcon className="w-4 h-4 inline-block text-green-500" /> di penjuru kanan atas skrin.</p>
                        <p>Sistem ini memastikan anda mempunyai pengalaman yang lancar tanpa sebarang persediaan yang rumit.</p>
                    </SubSection>
                </Section>
                
                <Section title="Bab 2: Memahami Kos & Pengebilan" icon={CreditCardIcon}>
                    <p className="font-semibold">MONOklix.com beroperasi berdasarkan langganan, yang merangkumi akses anda ke platform dan kos penggunaan AI.</p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Tiada Pengebilan Setiap Penggunaan:</strong> Anda tidak dibilkan untuk setiap imej atau video yang anda jana. Status akaun anda (cth., Seumur Hidup, Langganan) menentukan akses anda kepada ciri-ciri AI.</li>
                        <li><strong>Polisi Penggunaan Adil:</strong> Walaupun kami tidak mempunyai had yang ketat, perkhidmatan ini tertakluk kepada polisi penggunaan adil untuk memastikan prestasi yang stabil untuk semua pengguna. Token unik anda mempunyai kuota harian yang tinggi, yang lebih daripada mencukupi untuk kegunaan profesional.</li>
                        <li><strong>Anda Mengawal Sepenuhnya:</strong> Akses anda diuruskan sepenuhnya melalui status akaun anda di MONOklix.com. Anda tidak memerlukan akaun Google Cloud atau persediaan pengebilan yang berasingan.</li>
                    </ul>
                </Section>
                
                <Section title="Bab 3: Suite Idea Kandungan AI" icon={LightbulbIcon}>
                    <p>Suite ini direka untuk membantu anda sumbang saran dan mencipta kandungan bertulis untuk keperluan pemasaran anda.</p>
                     <ul className="list-disc pl-5 space-y-2">
                        <li dangerouslySetInnerHTML={{ __html: '<strong class="font-semibold">Staf MONOklix:</strong> Satu pasukan ejen AI khusus. Pilih ejen (seperti Penyelidik Pasaran atau Penulis Iklan), berikan input anda, dan dapatkan output peringkat pakar untuk tugas-tugas tertentu.' }}/>
                        <li dangerouslySetInnerHTML={{ __html: '<strong class="font-semibold">Idea Kandungan:</strong> Atasi kebuntuan kreatif dengan memasukkan topik. AI menggunakan Carian Google untuk mencari trend semasa dan menjana 5 idea kandungan segar dengan tajuk dan penerangan.' }}/>
                        <li dangerouslySetInnerHTML={{ __html: '<strong class="font-semibold">Teks Pemasaran:</strong> Cipta teks pemasaran yang meyakinkan untuk iklan, media sosial, atau laman web. Hanya terangkan produk, sasaran audiens, dan nada yang dikehendaki.' }}/>
                        <li dangerouslySetInnerHTML={{ __html: '<strong class="font-semibold">Penjana Jalan Cerita:</strong> Titik permulaan yang sempurna untuk iklan video. Muat naik imej produk, tulis penerangan ringkas, dan AI akan menjana konsep papan cerita 1 babak yang lengkap.' }}/>
                    </ul>
                </Section>
                
                <Section title="Bab 4: Suite Imej AI" icon={ImageIcon}>
                    <p>Suite ini mengandungi alat yang berkuasa untuk mencipta dan memanipulasi imej.</p>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 border border-green-300 dark:border-green-700 rounded-lg bg-green-50 dark:bg-green-900/20">
                            <h5 className="font-bold text-green-800 dark:text-green-300 flex items-center gap-2">
                                <CheckCircleIcon className="w-5 h-5" />
                                Apa yang Ia Boleh Lakukan
                            </h5>
                            <ul className="list-disc pl-5 space-y-1 mt-3 text-sm">
                                <li>Menjana imej baru dari teks (Teks-ke-Imej).</li>
                                <li>Mengedit imej sedia ada menggunakan arahan teks (Imej-ke-Imej).</li>
                                <li>Meletakkan produk anda ke dalam latar belakang studio profesional.</li>
                                <li>Mencipta foto model realistik menggunakan produk anda.</li>
                                <li>Meningkatkan resolusi imej dan mempertingkatkan warna.</li>
                                <li>Membuang latar belakang dari foto.</li>
                            </ul>
                        </div>
                        <div className="p-4 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/20">
                            <h5 className="font-bold text-red-800 dark:text-red-300 flex items-center gap-2">
                                <XIcon className="w-5 h-5" />
                                Apa yang Ia Tidak Boleh Lakukan
                            </h5>
                            <ul className="list-disc pl-5 space-y-1 mt-3 text-sm">
                                <li>Menjana imej dengan teks tertentu yang boleh dibaca.</li>
                                <li>Meniru logo atau tanda jenama yang kompleks dengan sempurna.</li>
                                <li>Mencipta wajah fotorealistik selebriti terkenal disebabkan oleh dasar keselamatan.</li>
                                <li>Menjamin tangan atau bentuk anatomi yang sempurna dalam setiap penjanaan.</li>
                            </ul>
                        </div>
                    </div>
                     <SubSection title="Memahami Penapis Keselamatan">
                        <p>Semua penjanaan imej dan teks AI tertakluk kepada penapis keselamatan Google. Permintaan anda mungkin disekat jika ia mengandungi kandungan yang berkaitan dengan:</p>
                         <ul className="list-disc pl-5 space-y-2">
                            <li dangerouslySetInnerHTML={{ __html: '<strong class="font-semibold">Ucapan kebencian, gangguan, atau keganasan.</strong>' }} />
                            <li dangerouslySetInnerHTML={{ __html: '<strong class="font-semibold">Mencederakan diri sendiri.</strong>' }} />
                            <li dangerouslySetInnerHTML={{ __html: '<strong class="font-semibold">Bahan lucah secara eksplisit.</strong>' }} />
                        </ul>
                        <p>Jika permintaan anda disekat, cuba permudahkan prompt anda atau gunakan imej yang berbeza. Kami tidak boleh melumpuhkan penapis keselamatan ini.</p>
                    </SubSection>
                </Section>

                <Section title="Bab 5: Suite Video & Suara AI" icon={VideoIcon}>
                    <p>Cipta video yang menakjubkan dan suara latar profesional dengan mudah.</p>
                    <SubSection title="Penjanaan Video">
                        <p>Cipta video dari prompt teks. Anda juga boleh menyediakan imej permulaan. AI akan menganimasikan imej tersebut berdasarkan prompt anda. Untuk hasil terbaik, gunakan prompt deskriptif yang memperincikan babak dan aksi.</p>
                        <p>Alat ini sesuai untuk mencipta klip pendek yang dinamik untuk media sosial atau iklan.</p>
                    </SubSection>
                    <SubSection title="Papan Cerita Video">
                        <p>Ini adalah aliran kerja 2 langkah yang berkuasa untuk mencipta video ulasan produk. Dalam Langkah 1, anda menyediakan butiran produk dan arahan kreatif untuk menjana skrip papan cerita 4 babak. Dalam Langkah 2, AI menjana imej unik untuk setiap babak berdasarkan skrip.</p>
                        <p>Ini adalah cara terpantas untuk mendapatkan konsep visual yang lengkap untuk iklan video anda.</p>
                    </SubSection>
                    <SubSection title="Penggabung Video">
                        <p>Jahit beberapa klip video dari Galeri anda menjadi satu video. Pilih video yang ingin anda gabungkan mengikut urutan yang anda mahu ia muncul.</p>
                        <p>Pemprosesan dilakukan sepenuhnya dalam penyemak imbas anda, jadi ia peribadi dan pantas untuk klip pendek. (Pengguna Admin/Seumur Hidup sahaja)</p>
                    </SubSection>
                    <SubSection title="Studio Suara">
                        <p>Tukar sebarang teks menjadi suara latar profesional. Tulis skrip anda, pilih dari pelbagai pelakon suara (termasuk Bahasa Malaysia), dan laraskan kelajuan, pic, dan kelantangan.</p>
                        <p>Outputnya adalah fail WAV yang boleh anda gunakan dalam mana-mana editor video.</p>
                    </SubSection>
                </Section>
                
                <Section title="Bab 6: Memahami Model AI" icon={RobotIcon}>
                    <p>Platform ini menggunakan beberapa model AI Google yang berbeza, setiap satu dikhususkan untuk tugas tertentu.</p>
                    <SubSection title="Teks & Multimodal: Gemini 2.5 Flash">
                        <p>Nama Model: <code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">gemini-2.5-flash</code></p>
                        <p>Ini adalah model kerja utama kami. Ia digunakan untuk semua penjanaan teks (seperti teks pemasaran dan idea kandungan) dan untuk memahami imej (seperti dalam alat Jalan Cerita Iklan Produk dan Foto Produk).</p>
                        <p>Kami telah mengoptimumkannya untuk kelajuan dengan melumpuhkan bajet 'berfikir', yang bermaksud anda mendapat hasil anda dengan lebih cepat.</p>
                    </SubSection>
                    <SubSection title="Penjanaan Video: Model Veo">
                        <p>Veo adalah model utama Google untuk mencipta video dari teks atau imej.</p>
                        <p>Penjanaan video menggunakan model yang berbeza dengan keupayaan yang berbeza:</p>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li><code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">veo-3.1-generate-001</code>: Model yang paling berkuasa, menghasilkan video berkualiti tertinggi. Ia sedikit lebih perlahan.</li>
                            <li><code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">veo-3.1-fast-generate-001</code>: Versi Veo 3 yang lebih pantas, sesuai untuk hasil yang cepat.</li>
                        </ul>
                    </SubSection>
                    <SubSection title="Bolehkah Saya Mencipta Video Dengan Suara Saya Sendiri?">
                        <p>Tidak secara langsung semasa penjanaan video. Ciri suara latar AI terbina dalam alat Papan Cerita Video pada masa ini menyokong set bahasa yang terhad.</p>
                        <p>Untuk suara latar tersuai, kami amat mengesyorkan menggunakan alat 'Studio Suara' untuk menjana fail audio, dan kemudian menggabungkannya dengan video yang anda jana dalam aplikasi penyuntingan video yang berasingan.</p>
                    </SubSection>
                    <SubSection title="Penyuntingan & Pengkomposisian Imej: Imagen V3">
                        <p>Model: <code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">Imagen V3 (melalui proksi)</code></p>
                        <p>Ini adalah model imej canggih Google. Ia digunakan untuk semua tugas yang melibatkan penyuntingan atau pengkomposisian imej, seperti meletakkan produk anda dalam latar belakang baru, mencipta foto model, meningkatkan kualiti, dan membuang latar belakang.</p>
                    </SubSection>
                    <SubSection title="Penjanaan Imej: Imagen 4">
                        <p>Nama Model: <code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">imagen-4.0-generate-001</code></p>
                        <p>Ini adalah model pakar yang digunakan hanya untuk penjanaan teks-ke-imej berkualiti tinggi dari awal dalam alat 'Penjanaan Imej'.</p>
                    </SubSection>
                </Section>

                <Section title="Bab 7: Prompt & Perpustakaan" icon={LibraryIcon}>
                    <p>Suite Perpustakaan Prompt adalah hab anda untuk inspirasi dan formula prompt yang terbukti.</p>
                    <SubSection title="Cara Menggunakan Perpustakaan">
                        <p>Suite ini kini hanya menampilkan satu perpustakaan utama:</p>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li dangerouslySetInnerHTML={{ __html: "<strong>Prompt Nano Banana:</strong> Koleksi prompt kreatif serba guna untuk penjanaan dan penyuntingan imej, yang bersumber dari projek komuniti sumber terbuka. Ini bagus untuk meneroka kemungkinan kreatif AI."}}></li>
                        </ul>
                        <p>Dalam perpustakaan, anda boleh melayari contoh-contoh. Apabila anda menjumpai yang anda suka, hanya klik butang 'Guna Prompt Ini'. Ini akan secara automatik menyalin prompt dan membawa anda ke alat Penjanaan Imej AI dengan prompt yang telah diisi, jadi anda boleh menjananya dengan segera atau menyesuaikannya lebih lanjut.</p>
                    </SubSection>
                </Section>
                        
                <Section title="Bab 8: Galeri, Sejarah, dan Log" icon={GalleryIcon}>
                    <SubSection title="Galeri & Sejarah">
                        <p>Setiap kandungan yang anda jana—imej, video, audio, dan teks—disimpan secara automatik ke storan penyemak imbas peranti anda (IndexedDB). Anda boleh mengakses semuanya di bahagian 'Galeri & Sejarah'. Dari sini, anda boleh melihat, memuat turun, atau menggunakan semula aset anda. Contohnya, anda boleh mengambil imej dari galeri anda dan menghantarnya ke alat Penjanaan Video untuk mencipta animasi.</p>
                    </SubSection>
                    <SubSection title="Log API AI">
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li><code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">Apakah itu?</code> Log API ialah rekod teknikal terperinci bagi setiap permintaan yang dibuat oleh penyemak imbas anda kepada model AI. Ia menunjukkan model yang digunakan, prompt penuh yang dihantar, respons yang diterima, dan status (Berjaya/Ralat).</li>
                            <li><code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">Di manakah ia?</code> Anda boleh menemuinya di dua tempat: sebagai tab dalam halaman `Galeri & Sejarah`, dan sebagai sebahagian daripada pop-up `Pemeriksaan Kesihatan Token` di pengepala.</li>
                            <li><code className="text-sm font-mono bg-neutral-200 dark:bg-neutral-700 p-1 rounded">Mengapa ia berguna?</code> Ia adalah alat yang sangat baik untuk penyahpepijatan. Jika penjanaan gagal, log selalunya akan mengandungi mesej ralat khusus dari API yang boleh membantu anda memahami mengapa (cth., sekatan keselamatan, Token tidak sah).</li>
                        </ul>
                    </SubSection>
                    <SubSection title="Storan">
                        <p>Oleh kerana semua data disimpan secara tempatan dalam penyemak imbas anda, membersihkan cache atau data tapak penyemak imbas anda akan memadamkan galeri dan sejarah log anda secara kekal. Kami tidak menyimpan kandungan yang anda jana di pelayan kami.</p>
                    </SubSection>
                </Section>

                <Section title="Bab 9: Penyelesaian Masalah Ralat Biasa" icon={AlertTriangleIcon}>
                    <p>Jika anda menghadapi ralat, ia biasanya disebabkan oleh salah satu daripada beberapa isu biasa. Berikut ialah panduan ringkas tentang maksudnya dan cara menyelesaikannya.</p>
                    <div className="mt-6 overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="text-xs text-neutral-700 uppercase bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400">
                                <tr>
                                    <th scope="col" className="px-4 py-3 border border-neutral-300 dark:border-neutral-700">Masalah / Kod Ralat</th>
                                    <th scope="col" className="px-4 py-3 border border-neutral-300 dark:border-neutral-700">Punca Kemungkinan</th>
                                    <th scope="col" className="px-4 py-3 border border-neutral-300 dark:border-neutral-700">Penyelesaian</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">E-mel tidak berdaftar</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Pengguna memasukkan e-mel yang tidak wujud dalam pangkalan data.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Semak semula ejaan e-mel.<br/>2. Pastikan pengguna telah mendaftar di laman web utama (monoklix.com).<br/>3. Jika masih gagal, hubungi admin untuk menyemak status akaun." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">Akaun tidak aktif (inactive)</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Status pengguna telah ditukar kepada tidak aktif oleh admin.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Hubungi admin untuk pengaktifan semula akaun.</td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">401 Unauthorized / 403 Permission Denied</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "Token mungkin tidak sah, tamat tempoh, atau disekat oleh Google." }}></td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "Ini adalah isu di pihak platform. Sila laporkan kepada admin dengan segera melalui butang 'Lapor kepada Admin' pada tetingkap ralat atau melalui WhatsApp." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">429 Resource Exhausted</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Platform telah mencapai had penggunaan (rate limit) API yang dikongsi.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "Ini biasanya isu sementara. Sila tunggu beberapa minit dan cuba lagi. Admin akan dimaklumkan untuk meningkatkan had jika perlu." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">500 Internal Server Error / 503 Service Unavailable</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Terdapat ralat dalaman atau penyelenggaraan pada pelayan Google. Ini adalah isu sementara dan bukan berpunca daripada akaun atau prompt anda.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Ini biasanya isu sementara. Sila tunggu beberapa minit dan cuba semula permintaan anda.<br/>2. Jika masalah berterusan, semak status Token atau hubungi admin." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">Ralat Rangkaian (Network Error)</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Sambungan internet anda terputus, atau terdapat sesuatu (seperti perisian firewall atau ad-blocker) yang menghalang aplikasi daripada menghubungi pelayan Google.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Semak sambungan internet anda.<br/>2. Cuba muat semula (refresh) halaman.<br/>3. Lumpuhkan sementara sebarang perisian ad-blocker atau VPN dan cuba lagi." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">Penjanaan Video (Veo) gagal tetapi servis lain berfungsi.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Model Veo memerlukan token pengesahan khas (__SESSION) yang berbeza daripada Kunci API Gemini biasa. Token ini mungkin telah tamat tempoh.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "Ini adalah isu platform. Sila laporkan kepada admin supaya token baharu boleh dikemas kini." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">400 Bad Request / Mesej ralat 'Safety Filter'</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Prompt (arahan teks) atau imej yang dimuat naik telah disekat oleh penapis keselamatan Google kerana kandungan yang mungkin sensitif.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Permudahkan prompt anda. Elakkan perkataan yang terlalu deskriptif atau yang boleh disalah tafsir.<br/>2. Jika menggunakan imej, cuba gunakan imej yang berbeza dan lebih neutral.<br/>3. Rujuk Panduan Mula &gt; Bab 3 untuk memahami jenis kandungan yang disekat." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">Penjanaan video mengambil masa lama atau gagal tanpa ralat jelas.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Model Veo sememangnya mengambil masa beberapa minit untuk menjana video. Kegagalan senyap selalunya disebabkan oleh sekatan polisi keselamatan pada prompt atau imej.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Sila bersabar dan tunggu sehingga 5-10 minit.<br/>2. Jika masih gagal, cuba permudahkan prompt atau gunakan imej rujukan yang berbeza.<br/>3. Semak Log API AI (dalam Galeri) untuk melihat jika ada mesej ralat teknikal." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">Imej yang dihasilkan tidak seperti yang dijangka (cth., Suntingan Imej tidak mengedit imej).</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Prompt yang diberikan kepada model AI mungkin kurang jelas atau boleh ditafsir dalam pelbagai cara.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Jadikan prompt anda lebih spesifik. Contoh: Daripada 'tambah topi', cuba 'letakkan topi berwarna merah pada kepala orang di dalam imej ini'.</td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">Galeri tidak menyimpan hasil janaan terbaru.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top">Pangkalan data tempatan (IndexedDB) dalam pelayar mungkin mengalami `deadlock` atau rosak.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Lakukan `hard refresh` pada pelayar (Ctrl + Shift + R).<br/>2. Jika masalah berterusan, pergi ke Tetapan &gt; Profil &gt; Pengurus Cache Video dan klik 'Kosongkan Semua Cache'. Ini akan memadamkan video yang disimpan tetapi mungkin menyelesaikan isu pangkalan data." }}></td></tr>
                                <tr className="border-b dark:border-neutral-800"><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top font-semibold">Penggabung Video gagal berfungsi.</td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Pustaka FFmpeg gagal dimuatkan dari CDN (masalah internet atau disekat oleh ad-blocker).<br/>2. Klip video yang dipilih terlalu besar, menyebabkan pelayar kehabisan memori." }}></td><td className="px-4 py-4 border border-neutral-300 dark:border-neutral-700 align-top" dangerouslySetInnerHTML={{ __html: "1. Pastikan sambungan internet stabil.<br/>2. Cuba lumpuhkan ad-blocker buat sementara waktu.<br/>3. Cuba gabungkan klip yang lebih pendek (kurang dari 1 minit setiap satu)." }}></td></tr>
                            </tbody>
                        </table>
                    </div>
                </Section>
            </div>
        </div>
    );
};

// FIX: Changed to a named export to resolve the "no default export" error.
export { GetStartedView };