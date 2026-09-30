// Legacy path: pages still import from here. Maps the old variant names
// onto the Tenun Laut button in components/ui.
import UIButton from '../ui/Button';

const LEGACY = { outline: 'secondary', secondary: 'secondary' };

export default function Button({ variant = 'primary', ...props }) {
  return <UIButton variant={LEGACY[variant] || variant} {...props} />;
}
