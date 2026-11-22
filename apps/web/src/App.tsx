import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Shell from './components/Shell';
import Login from './pages/Login';
import { Skeleton } from './components/ui';

const POS = lazy(() => import('./pages/POS'));
const Orders = lazy(() => import('./pages/Orders'));
const VerifiedReport = lazy(() => import('./pages/VerifiedReport'));
const Verify = lazy(() => import('./pages/Verify'));
const Kitchen = lazy(() => import('./pages/Kitchen'));
const Stock = lazy(() => import('./pages/Stock'));
const MenuAdmin = lazy(() => import('./pages/MenuAdmin'));
const TablesPage = lazy(() => import('./pages/Tables'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Money = lazy(() => import('./pages/Money'));
const CustomersPage = lazy(() => import('./pages/Customers'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Prints = lazy(() => import('./pages/Prints'));
const More = lazy(() => import('./pages/More'));
const PublicFeedback = lazy(() => import('./pages/PublicFeedback'));
const PublicReceipt = lazy(() => import('./pages/PublicReceipt'));

function Guard({ perm, children }: { perm?: string[]; children: ReactElement }) {
  const { can } = useAuth();
  if (perm && !perm.some(can)) return <Navigate to="/" replace />;
  return children;
}

/** First screen after login depends on what the person is allowed to do. */
function Home() {
  const { can } = useAuth();
  if (can('reports.view')) return <Navigate to="/dashboard" replace />;
  if (can('orders.create')) return <Navigate to="/pos" replace />;
  if (can('kitchen.view')) return <Navigate to="/kitchen" replace />;
  if (can('stock.view')) return <Navigate to="/stock" replace />;
  if (can('reports.view')) return <Navigate to="/dashboard" replace />;
  return <p className="p-8 text-ink-soft">Your account has no screens yet. Ask the owner to give you a role.</p>;
}

export default function App() {
  const { me, loading } = useAuth();
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-40" /></div>}>
      <Routes>
        <Route path="/f/:token" element={<PublicFeedback />} />
        <Route path="/r/:token" element={<PublicReceipt />} />
        <Route
          path="*"
          element={
            loading ? <div className="p-6"><Skeleton className="h-40" /></div>
            : !me ? <Login />
            : (
              <Shell>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/pos" element={<Guard perm={['orders.create']}><POS /></Guard>} />
                  <Route path="/verified-report" element={<Guard perm={['reports.view']}><VerifiedReport /></Guard>} />
                  <Route path="/verify" element={<Guard perm={['bills.verify']}><Verify /></Guard>} />
                  <Route path="/orders" element={<Guard perm={['orders.create', 'reports.view']}><Orders /></Guard>} />
                  <Route path="/kitchen" element={<Guard perm={['kitchen.view']}><Kitchen /></Guard>} />
                  <Route path="/stock" element={<Guard perm={['stock.view']}><Stock /></Guard>} />
                  <Route path="/menu" element={<Guard perm={['menu.edit']}><MenuAdmin /></Guard>} />
                  <Route path="/tables" element={<Guard perm={['tables.manage']}><TablesPage /></Guard>} />
                  <Route path="/dashboard" element={<Guard perm={['reports.view']}><Dashboard /></Guard>} />
                  <Route path="/money" element={<Guard perm={['expenses.manage', 'cash.manage']}><Money /></Guard>} />
                  <Route path="/customers" element={<Guard perm={['customers.view']}><CustomersPage /></Guard>} />
                  <Route path="/prints" element={<Guard perm={['printers.view', 'orders.create']}><Prints /></Guard>} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/more" element={<More />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Shell>
            )
          }
        />
      </Routes>
    </Suspense>
  );
}
