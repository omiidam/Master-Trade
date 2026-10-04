/**
 * Current course and lesson — the one card the overview is organised around.
 *
 * `surface="featured"` is the system's "this is the subject of the screen" form: accent-lit,
 * laid out with the flood of a hero panel. It earns that here because a learner's next action
 * comes out of this card, and because it is the only section whose content is a *place* rather
 * than a figure. Course and lesson are two wells inside it (`CardTile`) so the pair stays one
 * card — they are one destination: a lesson means little without the course it belongs to.
 *
 * Its density is stated so the featured panel and the data frame beside it begin their titles on the
 * same line; the accent flood is what makes this card the subject of the screen, and it does not
 * need an extra 8px of padding to say so. The two wells share the body evenly, so the pair reads as
 * one balanced pair whether each holds a course or an empty state.
 */

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardDescription,
  CardTile,
  CardTitle,
} from '../Card';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { Clock } from 'lucide-react';
import { msg } from '../../i18n/index.js';
import type { DashboardCourseView } from '@shared/frontend/viewModels';

export interface CourseLessonSectionProps {
  /** The course in progress, or `null`. */
  course: DashboardCourseView['course'];
  /** The lesson in progress, or `null`. */
  lesson: DashboardCourseView['lesson'];
}

export function CourseLessonSection({ course, lesson }: CourseLessonSectionProps) {
  return (
    <Card surface="featured" density="cozy" className="flex flex-col">
      <CardHeader divider>
        <div>
          <CardTitle>{msg('dashboard.currentCourseAndLesson')}</CardTitle>
          <CardDescription>{msg('dashboard.serverDerived')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 [&>*]:grow [&>*]:basis-0">
        {course === null ? (
          <EmptyState title={msg('dashboard.noCourseInProgress')} />
        ) : (
          <CardTile as="section" aria-label={msg('dashboard.course')} className="space-y-1">
            <p className="text-caption font-medium text-text-faint">{msg('dashboard.course')}</p>
            <p className="text-body font-semibold text-text">{course.title}</p>
            <p className="text-caption text-text-muted">
              <span className="num">{course.lessonsTotal}</span> {msg('academy.lessons')}
            </p>
          </CardTile>
        )}
        {lesson === null ? (
          <EmptyState
            icon={<Clock size={20} aria-hidden />}
            title={msg('dashboard.noLessonInProgress')}
            description={msg('dashboardPage.completedLessonsAndGradedExamsWillAppearHere')}
            hint={msg('dashboardPage.emptyIsAValidStateItIs')}
          />
        ) : (
          <CardTile as="section" aria-label={msg('dashboard.lesson')} className="space-y-1">
            <p className="text-caption font-medium text-text-faint">{msg('dashboard.lesson')}</p>
            <p className="text-body font-semibold text-text">{lesson.title}</p>
            <Badge tone="info">{msg('dashboard.lessonInProgress')}</Badge>
          </CardTile>
        )}
      </CardContent>
      <CardFooter className="text-caption text-text-faint">
        <span>{msg('dashboard.basedOnAttempts')}</span>
      </CardFooter>
    </Card>
  );
}
