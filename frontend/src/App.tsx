import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import ScanPage from './pages/ScanPage';
import DatabasePage from './pages/DatabasePage';
import IngredientPage from './pages/IngredientPage';
import AddIngredientPage from './pages/AddIngredientPage';
import ComparePage from './pages/ComparePage';
import { HistoryDetailPage, HistoryListPage } from './pages/HistoryPage';
import MorePage from './pages/MorePage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ScanPage />} />
        <Route path="database" element={<DatabasePage />} />
        <Route path="database/new" element={<AddIngredientPage />} />
        <Route path="database/:id" element={<IngredientPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="history" element={<HistoryListPage />} />
        <Route path="history/:id" element={<HistoryDetailPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="*" element={<ScanPage />} />
      </Route>
    </Routes>
  );
}
