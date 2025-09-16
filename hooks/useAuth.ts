import useLocalStorageState from './useLocalStorageState';
import type { User } from '../types';


// In a real application, this would involve OAuth flows.
// For now, we'll mock the login process.
const mockLogin = (provider: 'google' | 'facebook' | 'microsoft'): User => {
  console.log(`Simulating login with ${provider}...`);
  const name = 'Usuario de Prueba';
  return {
    name,
    email: 'usuario@ejemplo.com',
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff&rounded=true`,
  };
};

export const useAuth = () => {
  const [user, setUser] = useLocalStorageState<User | null>('authUser', null);

  const login = (provider: 'google' | 'facebook' | 'microsoft') => {
    const userData = mockLogin(provider);
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
  };

  return { user, login, logout };
};
