import { render, screen, fireEvent } from '@testing-library/react'
import Modal from '../components/ui/Modal'

describe('Modal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders the title and children', () => {
    render(
      <Modal title="Add New Car" onClose={onClose}>
        <p>form goes here</p>
      </Modal>
    )
    expect(screen.getByText('Add New Car')).toBeInTheDocument()
    expect(screen.getByText('form goes here')).toBeInTheDocument()
  })

  test('calls onClose when the close button is clicked', () => {
    render(
      <Modal title="Edit Location" onClose={onClose}>
        <p>content</p>
      </Modal>
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('defaults to max-w-lg, but accepts a custom maxWidth', () => {
    const { container, rerender } = render(
      <Modal title="Default width" onClose={onClose}>
        <p>content</p>
      </Modal>
    )
    expect(container.querySelector('.max-w-lg')).toBeInTheDocument()

    rerender(
      <Modal title="Wide" onClose={onClose} maxWidth="max-w-2xl">
        <p>content</p>
      </Modal>
    )
    expect(container.querySelector('.max-w-2xl')).toBeInTheDocument()
  })

  test('renders as a fixed overlay', () => {
    const { container } = render(
      <Modal title="Test" onClose={onClose}>
        <p>content</p>
      </Modal>
    )
    expect(container.firstChild).toHaveClass('fixed', 'inset-0', 'z-50')
  })
})
