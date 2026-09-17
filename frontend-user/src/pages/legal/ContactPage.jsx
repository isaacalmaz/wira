import React from 'react';
import { ChevronLeft, Mail, Phone, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ContactPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      <div className="bg-white dark:bg-slate-800 px-4 py-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
          <ChevronLeft size={24} className="dark:text-white" />
        </button>
        <h1 className="text-lg font-bold dark:text-white">Hubungi Kami</h1>
      </div>
      
      <div className="p-4 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Tim Wira siap membantu Anda! Silakan hubungi kami melalui salah satu saluran resmi di bawah ini:
        </p>
        
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
            <Mail size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">Email</h3>
            <a href="mailto:wiraapp123@gmail.com" className="text-primary text-sm font-medium">wiraapp123@gmail.com</a>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0">
            <Phone size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">Telepon / WhatsApp</h3>
            <a href="tel:085975079134" className="text-green-600 text-sm font-medium">0859 7507 9134</a>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full flex items-center justify-center shrink-0">
            <MapPin size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">Alamat Kantor</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Nusa Tenggara Barat, Indonesia</p>
          </div>
        </div>
      </div>
    </div>
  );
}
