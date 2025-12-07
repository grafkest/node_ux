import { useOutletContext } from 'react-router-dom';
import { GraphContainer } from '../features/graph/GraphContainer';
import type { AppOutletContext } from '../App';

export function GraphPage() {
  const { graphPageProps } = useOutletContext<AppOutletContext>();

  return <GraphContainer {...graphPageProps} />;
}

export default GraphPage;
