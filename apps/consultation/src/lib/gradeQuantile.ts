const gradeQuantilePercentage = (gradeQuantileApplied: string) => {
  const [numerator, denominator] = gradeQuantileApplied.split('/').map(Number)
  return ((numerator ?? 0) * 100) / (denominator ?? 1)
}

export const gradeQuantileLabel = (gradeQuantileApplied: string) =>
  `${gradeQuantileApplied} (${gradeQuantilePercentage(gradeQuantileApplied)}%)`

export const gradeQuantileLevelLabel = (gradeQuantileApplied: string) =>
  `${gradeQuantilePercentage(gradeQuantileApplied)}% level`

export const gradeQuantileDisclosure = (gradeQuantileApplied: string) => {
  const percentage = gradeQuantilePercentage(gradeQuantileApplied)
  const comparison =
    gradeQuantileApplied === '1/2'
      ? 'This is a simple median.'
      : 'This is a higher bar than a simple median.'
  return `Grades on this election were settled at the ${percentage}% level: a candidate's grade is the highest grade that ${percentage}% of the voting power cast placed them at or above. ${comparison}`
}
