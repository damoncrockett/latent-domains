import { useState, useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { transition } from 'd3-transition';
import { zoom, zoomIdentity, D3ZoomEvent } from 'd3-zoom';
import './Experiment2Page.css';

const IMAGE_HOST = 'https://latent.domains';
const RESOLUTION_SMALL = '128';
const RESOLUTION_LARGE = '256';
const NUM_NEIGHBORS = 300;
const SVG_WIDTH = window.innerWidth;
const SVG_HEIGHT = window.innerHeight;
const CLIP_PATH_ID = 'rounded-corners-clip';
const RELATIVE_ROUNDING_RADIUS = 15 / 128;
const IMAGE_GAP_FACTOR = 0.1;

interface ImageData {
  stem: string;
  x: number;
  y: number;
  size: number;
  isFocal: boolean;
}

interface GridCoord {
  i: number;
  j: number;
  dist: number; 
}

const isCentralBlock = (i: number, j: number): boolean => {
    return Math.abs(i) <= 1 && Math.abs(j) <= 1;
};

interface NeighborData {
  [feature: string]: number[];
}

function Experiment2Page() {
  const [allStems, setAllStems] = useState<string[]>([]);
  const [nnData, setNnData] = useState<NeighborData[]>([]); 
  const [currentStems, setCurrentStems] = useState<string[]>([]);
  const [focalStem, setFocalStem] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string>("resnet"); 
  const prevFocalStemRef = useRef<string | null>(null); 
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomGroupRef = useRef<SVGGElement | null>(null);

  const focalStemRef = useRef(focalStem);
  useEffect(() => {
    focalStemRef.current = focalStem;
  }, [focalStem]);

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates if component unmounts during fetch

    Promise.all([
      fetch('/image_stems.json').then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status} fetching image_stems.json`);
        return res.json();
      }),
      fetch('/nn.json').then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status} fetching nn.json`);
        return res.json();
      })
    ])
    .then(([stemsData, neighborsData]: [string[], NeighborData[]]) => {
      if (!isMounted) return;

      // --- Determine initial state values *before* setting state ---
      let initialFocal: string | null = null;
      let initialNeighbors: string[] = [];
      const initialFeature = selectedFeature;

      if (stemsData.length > 0 && neighborsData.length > 0 && stemsData.length === neighborsData.length) {
          const initialFocalIndex = Math.floor(Math.random() * stemsData.length);
          initialFocal = stemsData[initialFocalIndex];

          const neighborIndices = neighborsData[initialFocalIndex]?.[initialFeature];

          if (neighborIndices) {
              initialNeighbors = neighborIndices
                  .map(index => stemsData[index]) 
                  .filter((stem, idx) => { 
                      if (stem === undefined) {
                          console.warn(`Initial Setup: Neighbor index ${neighborIndices[idx]} for feature ${initialFeature} is out of bounds for stems list (length ${stemsData.length}).`);
                          return false;
                      }
                      return true;
                  })
                  .slice(0, NUM_NEIGHBORS); 

              if (initialNeighbors.length < NUM_NEIGHBORS && neighborIndices.length >= NUM_NEIGHBORS) {
                   console.warn(`Initial Setup: Found only ${initialNeighbors.length} valid neighbors for initial focal ${initialFocal} and feature ${initialFeature}, despite ${neighborIndices.length} indices being available.`);
              }

          } else {
              console.error(`Initial Setup: Feature "${initialFeature}" not found in nnData for stem index ${initialFocalIndex}. Available features:`, Object.keys(neighborsData[initialFocalIndex] || {}));
          }
      } else {
          console.error('Initial data loading error: stems or nnData empty, or lengths mismatch.', { stems: stemsData.length, nn: neighborsData.length });
      }
      // --- End of initial state calculation ---

      // Set all initial states together. React 18+ batches these automatically,
      // preventing multiple intermediate renders from this block.
      setAllStems(stemsData);
      setNnData(neighborsData);
      setFocalStem(initialFocal); 
      setCurrentStems(initialNeighbors);

    })
    .catch(error => {
        if (isMounted) {
            console.error('Error fetching initial data:', error);
        }
    });

    // Cleanup function for the effect: set isMounted to false when the component unmounts
    // or before the effect re-runs (though it shouldn't re-run with `[]` dependency).
    return () => {
      isMounted = false;
    };

  }, []);

  // (This function is now primarily used by event handlers, not the initial load)
  const selectNeighborsByFeature = (
    focal: string,
    feature: string,
    stems: string[],
    neighbors: NeighborData[]
  ) => {
    const focalIndex = stems.indexOf(focal);
    if (focalIndex === -1 || focalIndex >= neighbors.length) {
      console.error(`selectNeighborsByFeature: Focal stem "${focal}" not found or nnData out of bounds (index ${focalIndex}, length ${neighbors.length}).`);
      setCurrentStems([]); 
      return;
    }

    const neighborIndices = neighbors[focalIndex]?.[feature];
    if (!neighborIndices) {
        console.error(`selectNeighborsByFeature: Feature "${feature}" not found for stem index ${focalIndex}. Available features:`, Object.keys(neighbors[focalIndex] || {}));
        setCurrentStems([]); 
        return;
    }

    const neighborStems = neighborIndices
        .map(index => stems[index])
        .filter((stem, idx) => { 
             if (stem === undefined) {
                console.warn(`selectNeighborsByFeature: Neighbor index ${neighborIndices[idx]} for feature ${feature} is out of bounds for stems list (length ${stems.length}).`);
                return false;
             }
             return true;
        });


     if (neighborStems.length !== neighborIndices.length) {
         console.warn(`selectNeighborsByFeature: Some neighbor indices were out of bounds for the stems list for feature ${feature}. Found ${neighborStems.length}/${neighborIndices.length} valid stems.`);
     }

    setCurrentStems(neighborStems.slice(0, NUM_NEIGHBORS));
  };

  const handleImageClick = (newFocalStem: string) => {
    if (newFocalStem === focalStem) return; 
    setFocalStem(newFocalStem);
    selectNeighborsByFeature(newFocalStem, selectedFeature, allStems, nnData);
  };

  // nnData is included because the initial render might happen before nnData is ready without it
  useEffect(() => {
    if (!svgRef.current || !zoomGroupRef.current || !focalStem || currentStems.length === 0 || allStems.length === 0 || nnData.length === 0) {
      return;
    }

    const svg = select(svgRef.current);
    const zoomGroup = select(zoomGroupRef.current);

    const focalSize = parseInt(RESOLUTION_LARGE, 10);
    const neighborSize = parseInt(RESOLUTION_SMALL, 10);
    const gap = neighborSize * IMAGE_GAP_FACTOR;
    const cellSize = neighborSize + gap;

    const potentialCoords: GridCoord[] = [];
    // Add buffer for square grid and central exclusion zone.
    const estimatedRadius = Math.ceil(Math.sqrt((NUM_NEIGHBORS + 9) / Math.PI)) + 2; 
    const maxLayer = estimatedRadius; 

    for (let i = -maxLayer; i <= maxLayer; i++) {
        for (let j = -maxLayer; j <= maxLayer; j++) {
            // Skip the central 3x3 block reserved for the focal image
            if (isCentralBlock(i,j)) {
                continue;
            }
            const dist = Math.sqrt(i * i + j * j);
            potentialCoords.push({ i, j, dist });
        }
    }

    potentialCoords.sort((a, b) => a.dist - b.dist);

    const finalGridCoords = potentialCoords.slice(0, NUM_NEIGHBORS);

     if (finalGridCoords.length < NUM_NEIGHBORS) {
        console.warn(`Grid generation yielded only ${finalGridCoords.length} coordinates, less than requested ${NUM_NEIGHBORS}. Increase maxLayer?`);
    }

    const neighborImageData: ImageData[] = currentStems.map((stem, index) => {
      if (index >= finalGridCoords.length) {
         console.error(`Attempting to access coordinate index ${index}, but only ${finalGridCoords.length} coordinates available.`);
          return { stem, x: 0, y: 0, size: neighborSize, isFocal: false };
      }
      const coord = finalGridCoords[index];
      const x = coord.i * cellSize - neighborSize / 2;
      const y = coord.j * cellSize - neighborSize / 2;

      return {
        stem: stem,
        x: x,
        y: y,
        size: neighborSize,
        isFocal: false,
      };
    });

    const allImageData: ImageData[] = [
      ...neighborImageData,
      {
        stem: focalStem,
        x: -focalSize / 2,
        y: -focalSize / 2,
        size: focalSize,
        isFocal: true,
      },
    ];

    const t = transition().duration(750);

    const images = zoomGroup.selectAll<SVGImageElement, ImageData>('image')
      .data(allImageData, (d: ImageData) => d.stem);

    images.exit()
      .transition(t)
      .attr('width', 0)
      .attr('height', 0)
      .style('opacity', 0)
      .remove();

    const enterImages = images.enter()
      .append('image')
      // Always enter with the small image URL initially
      .attr('xlink:href', (d: ImageData) => `${IMAGE_HOST}/images${RESOLUTION_SMALL}/${d.stem}.webp`)
      .attr('clip-path', `url(#${CLIP_PATH_ID})`)
      .style('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d: ImageData) => handleImageClick(d.stem))
      // Initial state for transition: at final position, but small/faded
      .attr('x', (d: ImageData) => d.x)
      .attr('y', (d: ImageData) => d.y)
      .attr('width', 0)
      .attr('height', 0)
      .style('opacity', 0);

    images.merge(enterImages)
      // Use .each *before* the transition to set the correct image source
      // based on whether the focal image changed.
      .each(function(d: ImageData) { 
        const imageElement = select(this); 
        const smallImageUrl = `${IMAGE_HOST}/images${RESOLUTION_SMALL}/${d.stem}.webp`;

        if (d.isFocal) {
          const largeImageUrl = `${IMAGE_HOST}/images${RESOLUTION_LARGE}/${d.stem}.webp`;

          // Check if the focal image stem is different from the previous render
          if (d.stem !== prevFocalStemRef.current) {
            // Focal image CHANGED. Show small image first, then preload large.
            imageElement.attr('xlink:href', smallImageUrl);

            // Preload the large image
            const imgLoader = new Image();
            imgLoader.onload = () => {
              // IMPORTANT: Check if this image is STILL the focal image
              // when the load completes, as the user might have clicked quickly.
              // Use the focalStemRef for the up-to-date value.
              if (focalStemRef.current === d.stem) {
                imageElement.attr('xlink:href', largeImageUrl);
              }
            };
            imgLoader.onerror = () => {
              console.error("Failed to load large focal image:", largeImageUrl);
            };
            imgLoader.src = largeImageUrl;
          } else {
            // Focal image is the SAME as the previous render. Assume large is loaded or okay to load.
            imageElement.attr('xlink:href', largeImageUrl);
          }
        } else {
          // It's a neighbor image. Ensure it uses the small URL.
          imageElement.attr('xlink:href', smallImageUrl);
        }
      })
      .transition(t) 
      .attr('x', (d: ImageData) => d.x)
      .attr('y', (d: ImageData) => d.y)
      .attr('width', (d: ImageData) => d.size)
      .attr('height', (d: ImageData) => d.size)
      .style('opacity', 1); 

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if(zoomGroupRef.current) {
          select(zoomGroupRef.current).attr('transform', event.transform.toString());
        }
      });

     const currentTransform = select(zoomGroupRef.current).attr('transform');
     if (!currentTransform || currentTransform === `translate(${SVG_WIDTH / 2}, ${SVG_HEIGHT / 2})`) {
         svg.call(zoomBehavior)
           .call(zoomBehavior.transform, zoomIdentity.translate(SVG_WIDTH / 2, SVG_HEIGHT / 2).scale(1));
     } else {
         svg.call(zoomBehavior);
     }

    // Update the previous focal stem ref *after* all logic for this render cycle
    prevFocalStemRef.current = focalStem;

  }, [allStems, currentStems, focalStem, nnData]); 


  const handleFeatureButtonClick = (feature: string) => {
    console.log("Feature selected:", feature);
    setSelectedFeature(feature); 
    if (focalStem) {
        selectNeighborsByFeature(focalStem, feature, allStems, nnData);
    }
  };

  const features = ["hue", "saturation", "shape", "texture", "resnet", "siglip"];

  return (
    <div className="experiment-2-page">
      <div className="controls">
        {features.map(feature => (
          <button
            key={feature}
            onClick={() => handleFeatureButtonClick(feature)}
            className={selectedFeature === feature ? 'active' : ''}
            aria-pressed={selectedFeature === feature}
          >
            {feature}
          </button>
        ))}
      </div>
      <svg ref={svgRef} width={SVG_WIDTH} height={SVG_HEIGHT}>
        <defs>
          <clipPath id={CLIP_PATH_ID} clipPathUnits="objectBoundingBox">
            <rect
                width="1"
                height="1"
                rx={RELATIVE_ROUNDING_RADIUS}
                ry={RELATIVE_ROUNDING_RADIUS}
            />
          </clipPath>
        </defs>
        <g ref={zoomGroupRef} transform={`translate(${SVG_WIDTH / 2}, ${SVG_HEIGHT / 2})`}>
        </g>
      </svg>
    </div>
  );
}

export default Experiment2Page; 