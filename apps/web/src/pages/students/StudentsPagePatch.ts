// Patch instructions for StudentsPage.tsx
// Add these changes to the existing file:

// 1. Import NewStudentModal at top:
// import { NewStudentModal } from './NewStudentModal';

// 2. Add useState inside component:
// const [showNewStudent, setShowNewStudent] = useState(false);

// 3. Add icon import to existing import (already has Plus from lucide):
// import { ..., UserPlus } from 'lucide-react';

// 4. Add to SectionHeader actions:
// actions={
//   <Button size="sm" icon={<UserPlus size={14} />} onClick={() => setShowNewStudent(true)}>
//     Nuevo alumno
//   </Button>
// }

// 5. Before closing return tag add:
// <NewStudentModal open={showNewStudent} onClose={() => setShowNewStudent(false)} />
