import { useOutletContext } from 'react-router-dom';
import { InitiativesContainer } from '../features/initiatives/InitiativesContainer';
import type { AppOutletContext } from '../App';

export function InitiativesPage() {
  const { initiativesPageProps } = useOutletContext<AppOutletContext>();

  return <InitiativesContainer {...initiativesPageProps} />;
}

export default InitiativesPage;
