import { Link } from 'react-router-dom';
import './HomePage.css';

// Placeholder data for experiments
const experiments = [
  { id: 'experiment-1', title: 'Met Public Art', blurb: '260k Met Objects in WebGPU', image: 'metpublic.jpg' },
  { id: 'experiment-2', title: 'Midjourney Explore', blurb: 'Visual Exploration By Nearest Neighbor Search in Diverse Feature Spaces', image: '2001.jpg' },
];

function HomePage() {
  return (
    <div className="home-page">
      <h1>LATENT DOMAINS</h1>
      <p className="blurb">
        A collection of experiments exploring the intersection of computer vision, generative art, and user interfaces.
      </p>
      <div className="links-container">
        <a href="https://github.com/damoncrockett/latent-domains" target="_blank" rel="noreferrer">https://github.com/damoncrockett/latent-domains</a>
        <a href="https://x.com/DamonCrockett" target="_blank" rel="noreferrer">https://x.com/DamonCrockett</a>
      </div>
      <div className="experiment-grid">
        {experiments.map((exp) => (
          <Link to={`/experiments/${exp.id}`} key={exp.id} className="experiment-card">
            <img src={exp.image} alt={exp.title} className="card-image" />
            <h2 className="card-title">{exp.title}</h2>
            <p className="card-blurb">{exp.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default HomePage; 