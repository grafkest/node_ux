import { useOutletContext } from 'react-router-dom';
import { ExpertsContainer } from '../features/experts/ExpertsContainer';
import type { AppOutletContext } from '../App';

export function ExpertsPage() {
  const { expertsPageProps } = useOutletContext<AppOutletContext>();

  return <ExpertsContainer {...expertsPageProps} />;
}

export default ExpertsPage;
