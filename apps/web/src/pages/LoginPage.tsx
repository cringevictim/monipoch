export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-pochven-bg">
      <div className="text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight">
            <span className="text-pochven-accent">MONI</span>
            <span className="text-gray-300">POCH</span>
          </h1>
          <p className="text-gray-500 text-sm tracking-widest uppercase">
            Pochven Intelligence Platform
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="px-8 py-3 bg-pochven-accent/10 border border-pochven-accent/30 rounded-lg
                       text-pochven-accent font-medium hover:bg-pochven-accent/20
                       transition-all duration-200 hover:border-pochven-accent/50
                       hover:shadow-[0_0_20px_rgba(231,76,60,0.15)]"
          >
            Login with EVE Online
          </button>
          <p className="text-gray-600 text-xs">
            Alliance members only
          </p>
        </div>
      </div>
    </div>
  );
}
