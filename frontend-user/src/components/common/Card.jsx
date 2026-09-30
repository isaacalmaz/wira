// Legacy path: pages still import from here. Old Card had no padding of its
// own, so callers pass padding classes; keep that behaviour.
import UICard from '../ui/Card';

export default function Card({ padding = 'none', className = '', ...props }) {
  return <UICard padding={padding} className={`overflow-hidden ${className}`} {...props} />;
}
