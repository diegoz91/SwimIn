import React, { useMemo } from 'react';
import type { UserProfile, StructureProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';

interface ProfileCardProps {
  user: UserProfile | StructureProfile;
  onSelectProfile: () => void;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ user, onSelectProfile }) => {
  const { name, title, avatarUrl, location } = useMemo(() => {
    const isProfessional = user.userType === 'professional';
    
    let extractedName = 'Utente';
    if (isProfessional) {
        const prof = user as UserProfile;
        extractedName = `${prof.firstName || ''} ${prof.lastName || ''}`.trim() || 'Utente';
    } else {
        extractedName = (user as StructureProfile).structureName || 'Struttura';
    }

    const extractedTitle = isProfessional 
        ? ((user as UserProfile).title || 'Professionista') 
        : ((user as StructureProfile).structureType || 'Centro sportivo');

    const extractedLocation = user.city ? `${user.city}${user.province ? ` (${user.province})` : ''}` : 'Sede non specificata';
    
    const rawAvatar = isProfessional ? (user as UserProfile).avatar : (user as StructureProfile).logo;
    const fallbackAvatar = initialsAvatar(extractedName);

    return {
        name: extractedName,
        title: extractedTitle,
        avatarUrl: rawAvatar || fallbackAvatar,
        location: extractedLocation
    };
  }, [user]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectProfile();
    }
  };

  return (
    <div 
        className="bg-white border border-slate-200 rounded-3xl overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        onClick={onSelectProfile}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={`Visualizza profilo di ${name}`}
    >
        <div className="h-24 bg-gradient-to-r from-blue-600 to-cyan-500 relative"></div>
        <div className="px-5 pb-5 text-center relative">
            <div className="absolute -top-12 left-1/2 transform -translate-x-1/2">
                <img 
                    src={avatarUrl} 
                    alt={`Foto di ${name}`}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md bg-white group-hover:scale-105 transition-transform"
                    loading="lazy"
                />
            </div>
            
            <div className="pt-14">
                <h3 className="font-extrabold text-slate-800 text-lg leading-tight group-hover:text-blue-600 transition-colors truncate px-2" title={name}>
                    {name}
                </h3>
            </div>
            
            <p className="text-slate-500 text-sm font-medium mt-1 line-clamp-2 min-h-[40px] px-2" title={title}>
                {title}
            </p>
            
            <div className="border-t border-slate-100 mt-5 mb-4"></div>
            
            <div className="text-left space-y-3 text-slate-600 text-sm font-medium px-2">
                <div className="flex items-center group/item">
                    <div className="w-8 flex justify-center">
                        <Icon type="location" className="w-4 h-4 text-slate-400 group-hover/item:text-blue-500 transition-colors" />
                    </div>
                    <span className="truncate">{location}</span>
                </div>
                <div className="flex items-center justify-between group/item">
                    <div className="flex items-center">
                        <div className="w-8 flex justify-center">
                            <Icon type="users" className="w-4 h-4 text-slate-400 group-hover/item:text-blue-500 transition-colors" />
                        </div>
                        <span>Collegamenti</span>
                    </div>
                    <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                        {user.connections?.length || 0}
                    </span>
                </div>
            </div>
        </div>
    </div>
  );
};