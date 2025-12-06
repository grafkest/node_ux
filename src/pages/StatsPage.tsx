import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Loader } from '@consta/uikit/Loader';
import { useOutletContext } from 'react-router-dom';
import styles from '../App.module.css';
import type { AppOutletContext } from '../App';

const StatsDashboard = lazy(async () => ({
  default: (await import('../components/StatsDashboard')).default
}));

export function StatsPage() {
  const { statsPageProps } = useOutletContext<AppOutletContext>();

  return (
    <motion.main
      className={styles.statsMain}
      initial="hidden"
      animate="visible"
      variants={statsPageProps.pageVariants}
    >
      <Suspense fallback={<Loader size="m" />}>
        <StatsDashboard
          modules={statsPageProps.modules}
          domains={statsPageProps.domains}
          artifacts={statsPageProps.artifacts}
          reuseHistory={statsPageProps.reuseHistory}
        />
      </Suspense>
    </motion.main>
  );
}

export default StatsPage;
