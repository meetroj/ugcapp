/**
 * @format
 * Sign-up now collects a mobile number. It is compulsory and there is no OTP,
 * so the form itself is the only thing standing between a typo and an
 * application the ops team can't call back.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  SignUpForm,
  isValidPhone,
  normalizePhone,
} from '../src/screens/SignUpScreen';

function render(onSubmit: (values: any) => Promise<void>) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}>
        <SignUpForm onGoToLogin={() => {}} onSubmit={onSubmit} />
      </SafeAreaProvider>,
    );
  });
  return tree;
}

/** The three fields render in order: email, mobile number, password. */
function fields(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAllByType('TextInput' as never);
}

function type(input: any, text: string) {
  act(() => {
    input.props.onChangeText(text);
  });
}

/** "Create Account" — the only button rendered when onGoogle is omitted. */
function submitButton(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root
    .findAll(
      n =>
        typeof n.type !== 'string' &&
        typeof n.props.onPress === 'function' &&
        n
          .findAllByType('Text' as never)
          .some(t =>
            t.children
              .filter((c: unknown) => typeof c === 'string')
              .join('')
              .includes('Create Account'),
          ),
      { deep: true },
    )
    .at(0)!;
}

async function press(node: any) {
  await act(async () => {
    await node.props.onPress();
  });
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('mobile number rules', () => {
  it('keeps ten digits and strips formatting', () => {
    expect(normalizePhone('98765 43210')).toBe('9876543210');
    expect(normalizePhone('98765-43210')).toBe('9876543210');
  });

  it('drops a pasted +91 country code', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('919876543210')).toBe('9876543210');
  });

  it('accepts only a full ten-digit number', () => {
    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('987654321')).toBe(false);
    expect(isValidPhone('98765432101')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('sign-up form', () => {
  it('will not submit without a number', async () => {
    const onSubmit = jest.fn(async () => {});
    const tree = render(onSubmit);
    const [email, , password] = fields(tree);

    type(email, 'creator@example.com');
    type(password, 'hunter2');
    await press(submitButton(tree));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a short number instead of posting it', async () => {
    const onSubmit = jest.fn(async () => {});
    const tree = render(onSubmit);
    const [email, phone, password] = fields(tree);

    type(email, 'creator@example.com');
    type(phone, '98765');
    type(password, 'hunter2');
    await press(submitButton(tree));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('hands the normalized number to the caller', async () => {
    const onSubmit = jest.fn(async () => {});
    const tree = render(onSubmit);
    const [email, phone, password] = fields(tree);

    type(email, 'creator@example.com');
    type(phone, '+91 98765 43210');
    type(password, 'hunter2');
    await press(submitButton(tree));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '9876543210', role: 'creator' }),
    );
  });
});
