import { motion } from 'framer-motion';

interface Props {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isConduit: boolean;
  isHomeLink?: boolean;
}

export default function ConnectionLine({ x1, y1, x2, y2, isConduit, isHomeLink }: Props) {
  const stroke = isConduit ? '#aa5577' : isHomeLink ? '#ffffff' : '#3a2228';
  const strokeWidth = isConduit ? 1.5 : isHomeLink ? 0.8 : 1;
  const strokeOpacity = isConduit ? 0.5 : isHomeLink ? 0.15 : 0.35;
  const dashArray = isConduit ? '6 4' : isHomeLink ? '3 3' : undefined;

  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeDasharray={dashArray}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
    />
  );
}
