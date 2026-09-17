import { render, screen, fireEvent } from '@testing-library/react'
import PersonalInfoFields from '../components/booking/PersonalInfoFields'

function setup(props = {}) {
  const onNameChange = vi.fn()
  const onEmailChange = vi.fn()
  const onPhoneChange = vi.fn()
  render(
    <PersonalInfoFields
      idPrefix="test"
      name=""
      onNameChange={onNameChange}
      email=""
      onEmailChange={onEmailChange}
      phone=""
      onPhoneChange={onPhoneChange}
      {...props}
    />
  )
  return { onNameChange, onEmailChange, onPhoneChange }
}

describe('PersonalInfoFields', () => {
  test('renders labeled Full Name, Email Address, and Phone Number fields', () => {
    setup()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument()
  })

  test('name and email inputs are required; phone is not', () => {
    setup()
    expect(screen.getByLabelText(/full name/i)).toBeRequired()
    expect(screen.getByLabelText(/email address/i)).toBeRequired()
    expect(screen.getByLabelText(/phone number/i)).not.toBeRequired()
  })

  test('calls the change handlers with the field value', () => {
    const { onNameChange, onEmailChange, onPhoneChange } = setup()
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Priya Sharma' } })
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'priya@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '9876543210' } })
    expect(onNameChange).toHaveBeenCalledWith('Priya Sharma')
    expect(onEmailChange).toHaveBeenCalledWith('priya@example.com')
    expect(onPhoneChange).toHaveBeenCalledWith('9876543210')
  })

  test('ids are namespaced by idPrefix so the same page can render this twice without collisions', () => {
    setup({ idPrefix: 'cardetail' })
    expect(screen.getByLabelText(/full name/i)).toHaveAttribute('id', 'cardetail-name')
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('id', 'cardetail-email')
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute('id', 'cardetail-phone')
  })
})
