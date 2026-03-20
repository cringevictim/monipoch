import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import type { EveCharacter } from '@monipoch/shared';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    const payload = decodeJwtPayload(token);
    const char = payload?.character as EveCharacter | undefined;

    const character: EveCharacter = char
      ? {
          characterId: char.characterId,
          characterName: char.characterName,
          corporationId: char.corporationId,
          corporationName: char.corporationName,
          allianceId: char.allianceId,
          allianceName: char.allianceName,
          portraitUrl: char.portraitUrl,
        }
      : {
          characterId: 0,
          characterName: params.get('name') ?? 'Unknown',
          corporationId: 0,
        };

    setAuth(token, character);
    navigate('/', { replace: true });
  }, [params, navigate, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-pochven-bg">
      <p className="text-gray-400 animate-pulse">Authenticating...</p>
    </div>
  );
}
