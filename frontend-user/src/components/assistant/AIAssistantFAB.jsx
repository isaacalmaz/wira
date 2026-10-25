import { Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n';

export default function AIAssistantFAB({ onClick }) {
  const { lang } = useTranslation();
  const isEn = lang === 'en';

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
      <button
        type="button"
        onClick={onClick}
        aria-label={isEn ? 'Ask Wira AI Assistant' : 'Tanya Wira AI Assistant'}
        title={isEn ? 'Ask Wira AI Assistant' : 'Tanya Wira AI Assistant'}
        className="group relative flex min-h-11 items-center gap-2.5 rounded-full border border-white/20 bg-brand py-2.5 pl-3.5 pr-4 text-white shadow-pop transition-all hover:scale-105 hover:bg-brand-hover active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        {/* Animated Amber Ping Status */}
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emas-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emas-400" />
        </span>

        <span className="text-[13px] font-extrabold tracking-tight">
          {isEn ? 'Ask Wira AI' : 'Tanya Wira AI'}
        </span>

        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white transition group-hover:rotate-12">
          <Sparkles size={13} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
