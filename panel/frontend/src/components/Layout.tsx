import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Layout() {
  return (
    <div className="page-root">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
