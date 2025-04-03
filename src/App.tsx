import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {/* Add routes for experiments later, e.g.: */}
      {/* <Route path="/experiments/some-experiment" element={<SomeExperimentComponent />} /> */}
    </Routes>
  );
}

export default App
