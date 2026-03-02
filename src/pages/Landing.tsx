import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { 
  Gift, 
  Wallet, 
  Send, 
  ArrowRight, 
  Sparkles, 
  Shield, 
  Zap,
  TrendingUp,
  Users,
  Smartphone
} from 'lucide-react';

export default function Landing() {
  const { user } = useAuth();

  const features = [
    {
      icon: <Gift className="h-6 w-6" />,
      title: "Testnet Payouts",
      description: "Get instant 0.01 π testnet payouts with one click",
      href: "/testnet-payout",
      color: "from-blue-500 to-cyan-400"
    },
    {
      icon: <Wallet className="h-6 w-6" />,
      title: "Quick Withdraw",
      description: "Fast A2U withdrawals to your Pi wallet",
      href: "/a2u-withdrawal",
      color: "from-purple-500 to-pink-400"
    },
    {
      icon: <Send className="h-6 w-6" />,
      title: "A2U Payments",
      description: "Send Pi payments to other users",
      href: "/a2u",
      color: "from-green-500 to-emerald-400"
    },
    {
      icon: <Wallet className="h-6 w-6" />,
      title: "Pi Wallet",
      description: "Manage your Pi Network wallet",
      href: "/wallet",
      color: "from-orange-500 to-red-400"
    }
  ];

  const stats = [
    { icon: <Users className="h-5 w-5" />, label: "Active Users", value: "10K+" },
    { icon: <TrendingUp className="h-5 w-5" />, label: "Transactions", value: "50K+" },
    { icon: <Zap className="h-5 w-5" />, label: "Instant", value: "Payouts" },
    { icon: <Shield className="h-5 w-5" />, label: "Secure", value: "A2U" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-cyan-50 py-20">
        <div className="absolute inset-0 bg-grid-black/[0.02] bg-[size:50px_50px]" />
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            Pi Network A2U Platform
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent mb-6">
            OpenApp Pi Network
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Experience seamless App-to-User payments with instant testnet payouts and quick withdrawals. 
            Built for developers, powered by Pi Network.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/testnet-payout">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white font-semibold px-8 py-3 text-lg">
                <Gift className="h-5 w-5 mr-2" />
                Get Testnet Pi
              </Button>
            </Link>
            
            {user ? (
              <Link to="/a2u-withdrawal">
                <Button variant="outline" size="lg" className="border-blue-200 text-blue-700 hover:bg-blue-50 px-8 py-3 text-lg">
                  <Wallet className="h-5 w-5 mr-2" />
                  Quick Withdraw
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button variant="outline" size="lg" className="border-blue-200 text-blue-700 hover:bg-blue-50 px-8 py-3 text-lg">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white border-y">
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 text-blue-600 rounded-full mb-4">
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Quick Navigation
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Access all Pi Network A2U features with one click
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Link
                key={index}
                to={feature.href}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 hover:shadow-lg transition-all duration-300"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                
                <div className={`inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br ${feature.color} text-white rounded-xl mb-4`}>
                  {feature.icon}
                </div>
                
                <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-blue-600 transition-colors">
                  {feature.title}
                </h3>
                
                <p className="text-sm text-muted-foreground mb-4">
                  {feature.description}
                </p>
                
                <div className="flex items-center text-blue-600 font-medium text-sm group-hover:text-blue-700">
                  <span>Access Now</span>
                  <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-cyan-500">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of users using Pi Network A2U payments
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/testnet-payout">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-8 py-3 text-lg">
                <Gift className="h-5 w-5 mr-2" />
                Start with Testnet Pi
              </Button>
            </Link>
            
            <Link to="/a2u">
              <Button variant="outline" size="lg" className="border-white text-white hover:bg-white/10 px-8 py-3 text-lg">
                Explore A2U Features
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
