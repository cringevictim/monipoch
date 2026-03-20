export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-pochven-bg">
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
  );
}
