import { motion } from 'framer-motion';
import { Home, Wallet, User } from 'lucide-react';

export type TabType = 'home' | 'wallet' | 'profile' | string;

export interface NavItem {
  id: string;
  icon: any;
  label: string;
}

interface BottomNavProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
  items?: NavItem[];
}

export function BottomNav({ activeTab, onChange, items }: BottomNavProps) {
  const defaultTabs: NavItem[] = [
    { id: 'home', icon: Home, label: 'Inicio' },
    { id: 'wallet', icon: Wallet, label: 'Billetera' },
    { id: 'profile', icon: User, label: 'Perfil' },
  ];

  const tabs = items || defaultTabs;

  return (
    <nav 
      className="fixed bottom-0 inset-x-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex justify-around items-center h-16 px-6">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="relative flex flex-col items-center justify-center w-16 h-full transition-colors"
            >
              <motion.div
                animate={{
                  scale: isActive ? 1.15 : 1,
                  y: isActive ? -2 : 0,
                  color: isActive ? '#fa8072' : '#9ca3af'
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="relative z-10"
              >
                <Icon className={`w-6 h-6 ${isActive ? 'fill-orange-50/50' : ''}`} />
              </motion.div>
              
              <motion.span
                animate={{
                  opacity: isActive ? 1 : 0.7,
                  y: isActive ? 2 : 0,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#fa8072' : '#9ca3af'
                }}
                className="text-[10px] mt-1"
              >
                {tab.label}
              </motion.span>

              {isActive && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute -top-[1px] w-8 h-[3px] bg-gradient-primary rounded-b-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
