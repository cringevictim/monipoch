export default function LoginPage() {
  const scopeError = new URLSearchParams(window.location.search).get('error') === 'scopes';

  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-pochven-bg">
      <div className="flex flex-col items-center gap-4">
        {scopeError && (
          <div className="max-w-sm text-center px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">
            Missing required ESI permissions. Please log in again and accept all requested scopes.
          </div>
        )}
        <button
          onClick={handleLogin}
          className="px-8 py-3 bg-pochven-accent/10 border border-pochven-accent/30 rounded-lg
                     text-pochven-accent font-medium hover:bg-pochven-accent/20
                     transition-all duration-200 hover:border-pochven-accent/50
                     hover:shadow-[0_0_20px_rgba(231,76,60,0.15)]"
        >
          Only for Vyraj. members
        </button>
      </div>
    </div>
  );
}
