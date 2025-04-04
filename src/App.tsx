import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import Experiment2Page from './pages/Experiment2Page';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/experiments/experiment-2" element={<Experiment2Page />} />
    </Routes>
  );
}

export default App
